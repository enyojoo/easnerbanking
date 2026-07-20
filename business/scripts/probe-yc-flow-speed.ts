/**
 * Measure UX-relevant YC flow timings after split-lock changes.
 * Uses low-level YC helpers only (no Next.js server-only imports).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-yc-flow-speed.ts
 */
import { randomUUID } from "crypto"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { buildYcKycPersonMetadata } from "../lib/yellowcard/kyc-metadata"
import { getYellowcardEnvironment, getYellowcardRelayUrl } from "../lib/yellowcard/config"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import { listYellowcardNetworks } from "../lib/yellowcard/networks"
import { submitYcReceive } from "../lib/yellowcard/receive-submit"
import { submitYcSend } from "../lib/yellowcard/send-submit"
import { mapRecipientToYcSend } from "../lib/yellowcard/map-recipient-to-yc-send"
import { findYcReceiveChannel } from "../lib/yellowcard/receive-rails"
import { resolveYcSendChannelId } from "../lib/payout-providers/yellowcard-provider"
import { resolveRecipientPayoutCountry } from "../lib/terminal/recipient-sell-prepare"
import type { RecipientSellPrepareRow } from "../lib/terminal/recipient-sell-prepare"
import {
  findYcBalancePayoutRate,
  findYcCrossRate,
  findYcPayInLeg,
  listYcRates,
} from "../lib/fx/yc-rates"
import {
  computeYcBalancePayoutPricingBeforeSend,
  computeYcCrossBorderPricing,
} from "@easner/shared"

const USER_ID = String(process.env.YC_PROBE_USER_ID || "c7ace38e-be38-43e7-86e1-6e66b90d4243").trim()
const SKIP_LIVE = process.env.YC_PROBE_SKIP_LIVE === "1"

function userProfile(row: Record<string, unknown>) {
  return {
    residenceCountry: row.residence_country,
    kycIdType: row.kyc_id_type,
    kycIdNumber: row.kyc_id_number,
    ngLocalIdType: row.ng_local_id_type,
    ngLocalIdNumber: row.ng_local_id_number,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    dateOfBirth: row.date_of_birth,
    addressStreet: row.kyc_address_street,
    addressCity: row.kyc_address_city,
    addressCountry: row.kyc_address_country,
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; result?: T; error?: string }> {
  const started = Date.now()
  try {
    const result = await fn()
    return { ms: Date.now() - started, result }
  } catch (e) {
    return { ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) }
  }
}

function row(label: string, ms: number, note = "") {
  const target =
    label.includes("Continue") || label.toLowerCase().includes("preview") || label.includes("cache hit")
      ? "<500"
      : "—"
  console.log(
    `${label.padEnd(44)} ${String(ms).padStart(5)} ms${note ? `  (${note})` : ""}${target !== "—" ? `  [target ${target}]` : ""}`,
  )
}

async function main() {
  console.log("=== YC flow speed probe (post split-lock UX) ===")
  console.log("environment:", getYellowcardEnvironment())
  console.log("relay:", getYellowcardRelayUrl() || "(direct)")
  console.log("live YC locks:", SKIP_LIVE ? "no" : "yes")
  console.log("user:", USER_ID)
  console.log("")

  const admin = createSupabaseAdmin()
  const { data: userRow } = await admin.from("users").select("*").eq("id", USER_ID).maybeSingle()
  if (!userRow) throw new Error(`User ${USER_ID} not found`)

  const { data: recipients } = await admin
    .from("recipients")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(30)

  const ngRecipient = (recipients ?? []).find(
    (r) => String(r.currency).toUpperCase() === "NGN",
  ) as RecipientSellPrepareRow | undefined
  const kesRecipient = (recipients ?? []).find(
    (r) => String(r.currency).toUpperCase() === "KES",
  ) as RecipientSellPrepareRow | undefined

  console.log("--- Perceived UX (client; no YC on Continue) ---")
  row("Amount → Review Continue (all flows)", 0, "instant; no YC lock on Amount")
  console.log("")

  console.log("--- Review mount: previews (DB only) ---")

  const fundPreview = await timed(async () => {
    await listYcRates(admin, { status: "active" })
  })
  row("Fund balance DB rate preview", fundPreview.ms, fundPreview.error)

  if (kesRecipient) {
    const cbPreview = await timed(async () => {
      const rates = await listYcRates(admin, { status: "active" })
      const cross = findYcCrossRate(rates, "NGN", "KES")
      const fromLeg = findYcPayInLeg(rates, "NGN")
      const toLeg = findYcPayInLeg(rates, "KES")
      if (!cross?.rate) throw new Error("no cross rate")
      computeYcCrossBorderPricing({
        receiveAmount: 10_000,
        customerRate: cross.rate,
        ycSellFrom: Number(fromLeg?.yc_buy ?? 0),
        ycBuyTo: Number(toLeg?.yc_sell ?? 0),
        receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
        sendLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
      })
    })
    row("Cross-border /quote preview (DB)", cbPreview.ms, cbPreview.error)
  } else {
    console.log(`${"Cross-border /quote preview (DB)".padEnd(44)} skip (no KES recipient)`)
  }

  if (ngRecipient) {
    const payoutPreview = await timed(async () => {
      const rates = await listYcRates(admin, { status: "active" })
      const rateRow = findYcBalancePayoutRate(rates, "USD", "NGN")
      if (!rateRow?.customerRate) throw new Error("no payout rate")
      computeYcBalancePayoutPricingBeforeSend({
        receiveAmount: 50_000,
        customerRate: rateRow.customerRate,
        ycSell: rateRow.yc_sell ?? 0,
      })
    })
    row("Payout DB rate preview", payoutPreview.ms, payoutPreview.error)
  } else {
    console.log(`${"Payout DB rate preview".padEnd(44)} skip (no NGN recipient)`)
  }

  console.log("")
  console.log("--- Infra cache (Phase 2) ---")
  const channelsWarm = await timed(() => listYellowcardChannels())
  row("Channels list (1st call)", channelsWarm.ms, channelsWarm.error)
  const networksWarm = await timed(() => listYellowcardNetworks({ country: "NG" }))
  row("Networks NG (1st call)", networksWarm.ms, networksWarm.error)
  const channelsCached = await timed(() => listYellowcardChannels())
  row("Channels cache hit (2nd call)", channelsCached.ms)
  const networksCached = await timed(() => listYellowcardNetworks({ country: "NG" }))
  row("Networks cache hit (2nd call)", networksCached.ms)

  if (SKIP_LIVE) {
    console.log("\n[YC_PROBE_SKIP_LIVE=1] Skipping live lock probes.")
    return
  }

  console.log("")
  console.log("--- Review mount: live locks ---")

  const fundLock = await timed(async () => {
    const channels = await listYellowcardChannels()
    const recv = findYcReceiveChannel(channels, {
      country: "NG",
      currency: "NGN",
      rail: "bank_transfer",
    })
    const channelId = String(recv?.id ?? recv?.channelId ?? "")
    if (!channelId) throw new Error("no NG receive channel")
    const sender = buildYcKycPersonMetadata({ profile: userProfile(userRow), requireNgIds: true })
    await submitYcReceive({
      sequenceId: `yc_probe_flow_fb_${randomUUID()}`,
      customerUID: USER_ID,
      channelId,
      currency: "NGN",
      country: "NG",
      localAmount: 15_000,
      recipient: sender,
      payInRail: "bank_transfer",
      reason: "probe_flow_fund_balance",
    })
  })
  row("Fund balance lock POST /receive", fundLock.ms, fundLock.error)

  let leg2Ms = 0
  if (ngRecipient) {
    const sender = buildYcKycPersonMetadata({ profile: userProfile(userRow), requireNgIds: true })
    const receiveCountry = resolveRecipientPayoutCountry(ngRecipient) ?? "NG"
    const channelId = await resolveYcSendChannelId({
      countryCode: receiveCountry,
      currencyCode: "NGN",
      rail: "bank_transfer",
    })
    if (channelId) {
      const mapped = await mapRecipientToYcSend(ngRecipient, { channelId })
      const payoutLock = await timed(() =>
        submitYcSend({
          sequenceId: `yc_probe_flow_payout_${randomUUID()}`,
          customerUID: USER_ID,
          channelId,
          currency: "NGN",
          country: receiveCountry,
          settlementCryptoAmount: 50_000 / 1400,
          refundMode: "balance_payout",
          sender,
          destination: mapped.destination,
          sendExtras: mapped.root,
          reason: "probe_flow_payout",
        }),
      )
      row("Payout lock POST /send", payoutLock.ms, payoutLock.error)
    }
  }

  if (kesRecipient) {
    const rates = await listYcRates(admin, { status: "active" })
    const toLeg = findYcPayInLeg(rates, "KES")
    const ycBuyTo = Number(toLeg?.yc_sell ?? 0)
    const receiveCountry = resolveRecipientPayoutCountry(kesRecipient) ?? "KE"
    const sendChannelId = await resolveYcSendChannelId({
      countryCode: receiveCountry,
      currencyCode: "KES",
      rail: "bank_transfer",
    })
    if (sendChannelId && ycBuyTo > 0) {
      const sender = buildYcKycPersonMetadata({ profile: userProfile(userRow), requireNgIds: true })
      const mapped = await mapRecipientToYcSend(kesRecipient, { channelId: sendChannelId })
      const leg2 = await timed(() =>
        submitYcSend({
          sequenceId: `yc_probe_flow_cb_l2_${randomUUID()}`,
          customerUID: USER_ID,
          channelId: sendChannelId,
          currency: "KES",
          country: receiveCountry,
          settlementCryptoAmount: Math.round((10_000 / ycBuyTo) * 1_000_000) / 1_000_000,
          refundMode: "cross_border_send",
          sender,
          destination: mapped.destination,
          sendExtras: mapped.root,
          reason: "probe_flow_cross_border_leg2",
        }),
      )
      leg2Ms = leg2.ms
      row("Cross-border leg2 lock (review bg)", leg2.ms, leg2.error)
    }
  }

  console.log("")
  console.log("--- Pay tap: cross-border leg1 only ---")
  const leg1Probe = await timed(async () => {
    const channels = await listYellowcardChannels()
    const recv = findYcReceiveChannel(channels, {
      country: "NG",
      currency: "NGN",
      rail: "bank_transfer",
    })
    const channelId = String(recv?.id ?? recv?.channelId ?? "")
    const sender = buildYcKycPersonMetadata({ profile: userProfile(userRow), requireNgIds: true })
    await submitYcReceive({
      sequenceId: `yc_probe_flow_cb_l1_${randomUUID()}`,
      customerUID: USER_ID,
      channelId,
      currency: "NGN",
      country: "NG",
      localAmount: 150_000,
      recipient: sender,
      payInRail: "bank_transfer",
      reason: "probe_flow_cross_border_leg1",
    })
  })
  row("Cross-border leg1 POST /receive (Pay)", leg1Probe.ms, leg1Probe.error)

  console.log("")
  console.log("--- Before vs after (cross-border) ---")
  row("OLD Continue (leg2+leg1 sequential)", leg2Ms + leg1Probe.ms, "blocked Amount → Review")
  row("NEW Continue", 0, "instant navigation")
  row("NEW Review mount (leg2 only)", leg2Ms, "background spinner")
  row("NEW Pay tap (leg1 only)", leg1Probe.ms, "CTA spinner ~5s")

  console.log("")
  console.log("Done. Re-run: probe-yc-latency.ts for raw YC endpoint p50s.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
