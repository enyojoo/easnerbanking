/**
 * Live exact-local payout via YC balance settlement.
 *
 * Answers the questions a funded balance is required to settle:
 *   1. Does the recipient receive exactly `localAmount`?
 *   2. Is the service fee charged to our balance, or deducted from the recipient?
 *   3. How much USD does the balance actually lose (amount vs amount + fee)?
 *
 * This MOVES REAL MONEY. It is inert unless YC_PROBE_LIVE_SEND=confirm.
 *
 * Usage:
 *   cd business && \
 *   YC_PROBE_LIVE_SEND=confirm \
 *   YC_PROBE_RECIPIENT_ID=<recipients.id> \
 *   YC_PROBE_LOCAL_AMOUNT=2000 \
 *   node --env-file=.env.local --import tsx scripts/probe-yc-exact-local-live.ts
 */
import { randomUUID } from "crypto"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"
import { listYcAccountBalances, fetchYcAvailableBalance } from "../lib/yellowcard/account-balance"
import { fetchYcSendServiceFeeConfig } from "../lib/yellowcard/send-fee-config"
import { resolveYcSendChannelId } from "../lib/payout-providers/yellowcard-provider"
import { mapRecipientToYcSend } from "../lib/yellowcard/map-recipient-to-yc-send"
import { buildYcKycPersonMetadata } from "../lib/yellowcard/kyc-metadata"
import { submitYcSend, type YcSendSubmitResult } from "../lib/yellowcard/send-submit"
import { yellowcardFetch } from "../lib/yellowcard/http"
import type { RecipientSellPrepareRow } from "../lib/terminal/recipient-sell-prepare"

const LIVE = process.env.YC_PROBE_LIVE_SEND === "confirm"
const RECIPIENT_ID = String(process.env.YC_PROBE_RECIPIENT_ID ?? "").trim()
const LOCAL_AMOUNT = Number(process.env.YC_PROBE_LOCAL_AMOUNT ?? 2000)

function fmt(value: unknown): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value ?? null)
}

async function main() {
  console.log("=== YC exact-local payout (balance settlement) ===")
  console.log("environment:", getYellowcardEnvironment())

  const balances = await listYcAccountBalances()
  console.log("balances:", JSON.stringify(balances))
  const availableBefore = await fetchYcAvailableBalance("USD")
  console.log("USD available before:", availableBefore)

  if (!RECIPIENT_ID) {
    console.log("\nSet YC_PROBE_RECIPIENT_ID to continue.")
    return
  }

  const admin = createSupabaseAdmin()
  const { data: recipientRow } = await admin
    .from("recipients")
    .select("*")
    .eq("id", RECIPIENT_ID)
    .maybeSingle()
  if (!recipientRow) throw new Error(`Recipient ${RECIPIENT_ID} not found`)

  const recipient = recipientRow as RecipientSellPrepareRow & { user_id?: string }
  const currency = String(recipient.currency ?? "").trim().toUpperCase()
  const country = String(recipient.country_code ?? "").trim().toUpperCase()
  const rail =
    recipient.mobile_provider ||
    String(recipient.bank_name ?? "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)
  const channelType = rail === "mobile_money" ? "momo" : "bank"

  const feeConfig = await fetchYcSendServiceFeeConfig({
    country,
    currency,
    channelType,
    directSettlement: false,
  })
  console.log(`fee config (${country}/${currency}/${channelType}, balance):`, JSON.stringify(feeConfig))

  const channelId = await resolveYcSendChannelId({
    countryCode: country,
    currencyCode: currency,
    rail,
  })
  if (!channelId) throw new Error("No YC send channel for this corridor")

  const expectedFeeLocal = feeConfig
    ? Math.max(feeConfig.minFeeLocal, LOCAL_AMOUNT * (feeConfig.feePercentage / 100)) +
      feeConfig.flatFeeLocal
    : 0
  console.log(
    `\nplan: localAmount ${LOCAL_AMOUNT} ${currency}, expected service fee ${expectedFeeLocal} ${currency}`,
  )

  if (!LIVE) {
    console.log("\nDry run — set YC_PROBE_LIVE_SEND=confirm to submit. Nothing was sent.")
    console.log(
      "Optional: YC_PROBE_LOCK_ONLY=1 locks with forceAccept=false then denies (no payout, no float needed).",
    )
    return
  }

  const lockOnly = process.env.YC_PROBE_LOCK_ONLY === "1" || process.env.YC_PROBE_LOCK_ONLY === "true"
  if (!lockOnly && availableBefore <= 0) {
    throw new Error(
      "YC USD balance is 0 — top up, or set YC_PROBE_LOCK_ONLY=1 to lock+deny without paying.",
    )
  }

  const userId = String(recipient.user_id ?? "").trim()
  const { data: userRow } = await admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", userId)
    .maybeSingle()

  const sender = buildYcKycPersonMetadata({
    profile: {
      residenceCountry: String(userRow?.residence_country ?? "") || null,
      kycIdType: String(userRow?.kyc_id_type ?? "") || null,
      kycIdNumber: String(userRow?.kyc_id_number ?? "") || null,
      ngLocalIdType: String(userRow?.ng_local_id_type ?? "") || null,
      ngLocalIdNumber: String(userRow?.ng_local_id_number ?? "") || null,
      fullName: String(userRow?.full_name ?? "") || null,
      phone: String(userRow?.phone ?? "") || null,
      email: String(userRow?.email ?? "") || null,
      dateOfBirth: String(userRow?.date_of_birth ?? "") || null,
      addressStreet: String(userRow?.kyc_address_street ?? "") || null,
      addressCity: String(userRow?.kyc_address_city ?? "") || null,
      addressCountry: String(userRow?.kyc_address_country ?? "") || null,
    },
    requireNgIds: true,
  })
  const mapped = await mapRecipientToYcSend(recipient, { channelId })

  const sequenceId = `yc_exact_probe_${randomUUID()}`
  const sendRes = await submitYcSend({
    sequenceId,
    customerUID: userId || randomUUID(),
    customerType: "retail",
    channelId,
    currency,
    country,
    directSettlement: false,
    localAmount: LOCAL_AMOUNT,
    // Lock-only never pays; full live accepts immediately only when float is already funded.
    forceAccept: lockOnly ? false : true,
    refundMode: "balance_payout",
    sender,
    destination: mapped.destination,
    sendExtras: mapped.root,
    reason: "other",
  })

  console.log("\nPOST /send:")
  for (const key of [
    "id",
    "status",
    "amount",
    "convertedAmount",
    "localAmount",
    "rate",
    "serviceFeeAmountLocal",
    "serviceFeeAmountUSD",
    "networkFeeAmountLocal",
  ]) {
    console.log(`  ${key}:`, fmt((sendRes as Record<string, unknown>)[key]))
  }
  console.log("  settlementInfo:", JSON.stringify(sendRes.settlementInfo ?? null))

  const credited = Number(sendRes.convertedAmount ?? sendRes.localAmount ?? 0)
  const exact = Math.round(credited * 100) === Math.round(LOCAL_AMOUNT * 100)
  console.log(`\nexact credit? ${exact} (quoted ${LOCAL_AMOUNT}, locked ${credited})`)

  const sendId = String(sendRes.id ?? "").trim()
  if (lockOnly) {
    if (!exact) {
      throw new Error(`YC did not lock exact localAmount — aborting (send ${sendId})`)
    }
    await yellowcardFetch({
      method: "POST",
      path: `/send/${encodeURIComponent(sendId)}/deny`,
      json: {},
    })
    console.log(`denied send ${sendId} — no payout, float unchanged`)
    const feeLocal = Number(sendRes.serviceFeeAmountLocal ?? 0)
    const amountUsd = Number(sendRes.amount ?? 0)
    const rate = Number(sendRes.rate ?? 0)
    if (feeLocal > 0 && amountUsd > 0 && rate > 0) {
      const debitedLocal = amountUsd * rate
      console.log(
        `fee check: debit≈${debitedLocal.toFixed(2)} ${currency} vs credit+fee=${(LOCAL_AMOUNT + feeLocal).toFixed(2)}`,
      )
    }
    return
  }

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 6000))
    const full = await yellowcardFetch<YcSendSubmitResult>({
      method: "GET",
      path: `/send/${encodeURIComponent(sendId)}`,
    })
    const status = String(full.status ?? "")
    console.log(
      `  poll ${i + 1}: status=${status} converted=${fmt(full.convertedAmount)} fee=${fmt(full.serviceFeeAmountLocal)} amountUsd=${fmt(full.amount)}`,
    )
    if (["complete", "failed", "cancelled", "expired"].includes(status)) break
  }

  const availableAfter = await fetchYcAvailableBalance("USD")
  console.log("\nUSD available after:", availableAfter)
  console.log("balance delta:", Number((availableAfter - availableBefore).toFixed(6)))
  console.log(
    "\nCheck the recipient's bank credit against localAmount to confirm who absorbs the service fee.",
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
