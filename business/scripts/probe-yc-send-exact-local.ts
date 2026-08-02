/**
 * Can YC POST /send lock an exact local amount (instead of a 2dp USDC bucket)?
 *
 * directSettlement + settlementInfo.cryptoAmount quantises crypto to USDC cents, so a
 * 2000 NGN payout can only land on 1998.13 (1.47) or 2011.72 (1.48) at rate 1373.
 * This probe checks whether any request shape locks exact local AND still returns a
 * settlement walletAddress we can fund from the user's Turnkey wallet.
 *
 * Safety: forceAccept=false (stays pending approval, never disburses) and a small amount.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-yc-send-exact-local.ts
 */
import { randomUUID } from "crypto"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { yellowcardFetch } from "../lib/yellowcard/http"
import { getYellowcardEnvironment, getYellowcardRelayUrl } from "../lib/yellowcard/config"
import { buildYcKycPersonMetadata } from "../lib/yellowcard/kyc-metadata"
import { mapRecipientToYcSend } from "../lib/yellowcard/map-recipient-to-yc-send"
import { resolveYcSendChannelId } from "../lib/payout-providers/yellowcard-provider"
import { resolveRecipientPayoutCountry } from "../lib/terminal/recipient-sell-prepare"
import type { RecipientSellPrepareRow } from "../lib/terminal/recipient-sell-prepare"
import { findYcBalancePayoutRate, listYcRates } from "../lib/fx/yc-rates"
import { resolveYcPaymentReason } from "@easner/shared"

const USER_ID = String(
  process.env.YC_PROBE_USER_ID || "c7ace38e-be38-43e7-86e1-6e66b90d4243",
).trim()
/** Small so an unexpected disbursement is trivial. */
const RECEIVE_LOCAL = Number(process.env.YC_PROBE_RECEIVE_LOCAL || 1000)
const SERVICE_FEE_FRACTION = 0.01

type SendResponse = Record<string, unknown>

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function ceilTo(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.ceil(n * f - 1e-9) / f
}

function summarise(res: SendResponse): Record<string, unknown> {
  const settlement = (res.settlementInfo ?? {}) as Record<string, unknown>
  return {
    id: res.id,
    status: res.status,
    rate: res.rate,
    localAmount: res.localAmount,
    convertedAmount: res.convertedAmount,
    amount: res.amount,
    serviceFeeAmountLocal: res.serviceFeeAmountLocal,
    networkFeeAmountLocal: res.networkFeeAmountLocal,
    settlementCryptoAmount: settlement.cryptoAmount,
    settlementLocalRate: settlement.cryptoLocalRate,
    settlementWalletAddress: settlement.walletAddress,
  }
}

async function attempt(label: string, body: Record<string, unknown>): Promise<void> {
  console.log("=".repeat(78))
  console.log(label)
  console.log("=".repeat(78))
  console.log("request:", JSON.stringify(body, null, 2))
  try {
    const res = await yellowcardFetch<SendResponse>({ method: "POST", path: "/send", json: body })
    console.log("OK ->", JSON.stringify(summarise(res), null, 2))
  } catch (e) {
    const err = e as { status?: number; message?: string; body?: unknown }
    console.log("FAIL ->", err.status ?? "?", err.message)
    if (err.body) console.log("body:", JSON.stringify(err.body))
  }
  console.log("")
}

async function main() {
  console.log("=== YC /send exact-local probe ===")
  console.log("environment:", getYellowcardEnvironment())
  console.log("relay:", getYellowcardRelayUrl() || "(direct)")
  console.log("forceAccept: false (pending approval only — no disbursement)")
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
  const recipientRow = (recipients ?? []).find(
    (r) => String(r.currency).toUpperCase() === "NGN",
  ) as (RecipientSellPrepareRow & { id?: string }) | undefined
  if (!recipientRow) throw new Error("No NGN recipient for probe user")
  const recipient: RecipientSellPrepareRow = recipientRow

  const country = resolveRecipientPayoutCountry(recipient) ?? "NG"
  const channelId = await resolveYcSendChannelId({
    countryCode: country,
    currencyCode: "NGN",
    rail: "bank_transfer",
  })
  if (!channelId) throw new Error("No NGN send channel")

  const rates = await listYcRates(admin, { destinations: ["NGN"], status: "active" })
  const payoutRate = findYcBalancePayoutRate(rates, "NGN")
  const ycSell = Number(payoutRate?.yc_sell ?? 0)
  if (!(ycSell > 0)) throw new Error("Missing yc_sell for NGN")

  const targetGross = round(RECEIVE_LOCAL / (1 - SERVICE_FEE_FRACTION), 2)
  const exactCrypto = ceilTo(targetGross / ycSell, 6)
  const centCrypto = ceilTo(targetGross / ycSell, 2)

  console.log("recipient:", recipientRow.id, recipient.currency, "channel:", channelId)
  console.log("yc_sell:", ycSell)
  console.log(
    `target: net ${RECEIVE_LOCAL} NGN -> gross ${targetGross} -> crypto exact ${exactCrypto} / cent bucket ${centCrypto}`,
  )
  console.log(
    `cent quantum: 0.01 USDC = ${round(ycSell * 0.01 * (1 - SERVICE_FEE_FRACTION), 2)} NGN of net`,
  )
  console.log("")

  const sender = buildYcKycPersonMetadata({
    profile: {
      residenceCountry: userRow.residence_country,
      kycIdType: userRow.kyc_id_type,
      kycIdNumber: userRow.kyc_id_number,
      ngLocalIdType: userRow.ng_local_id_type,
      ngLocalIdNumber: userRow.ng_local_id_number,
      fullName: userRow.full_name,
      phone: userRow.phone,
      email: userRow.email,
      dateOfBirth: userRow.date_of_birth,
      addressStreet: userRow.kyc_address_street,
      addressCity: userRow.kyc_address_city,
      addressCountry: userRow.kyc_address_country,
    },
    requireNgIds: true,
  })
  const mapped = await mapRecipientToYcSend(recipient, { channelId })

  const turnkeyAddress = String(
    process.env.YC_PROBE_TURNKEY_ADDRESS || "CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC",
  ).trim()

  const base = {
    customerUID: USER_ID,
    customerType: "retail" as const,
    channelId,
    currency: "NGN",
    country,
    forceAccept: false,
    sender,
    destination: mapped.destination,
    ...mapped.root,
    reason: resolveYcPaymentReason("probe_exact_local"),
  }
  const settlementInfo = {
    cryptoCurrency: "USDC",
    cryptoNetwork: "SOL",
    refundAddress: turnkeyAddress,
    senderAddress: turnkeyAddress,
  }

  // Baseline: does YC honour 6dp crypto, or bucket it to 1.47-style cents?
  await attempt("A. directSettlement + 6dp cryptoAmount (current production path)", {
    ...base,
    sequenceId: `yc_probe_exact_a_${randomUUID()}`,
    directSettlement: true,
    settlementInfo: { ...settlementInfo, cryptoAmount: exactCrypto },
  })

  // Known rejection — kept so the constraint is documented by the probe output.
  await attempt("B. directSettlement + localAmount (expected rejection)", {
    ...base,
    sequenceId: `yc_probe_exact_b_${randomUUID()}`,
    directSettlement: true,
    localAmount: targetGross,
    settlementInfo: { ...settlementInfo, cryptoAmount: exactCrypto },
  })

  // The question that matters: exact local lock that still yields a deposit wallet.
  await attempt("C. directSettlement: false + localAmount + settlementInfo (crypto funding)", {
    ...base,
    sequenceId: `yc_probe_exact_c_${randomUUID()}`,
    directSettlement: false,
    localAmount: RECEIVE_LOCAL,
    settlementInfo,
  })

  await attempt("D. directSettlement: false + localAmount only (YC balance settlement)", {
    ...base,
    sequenceId: `yc_probe_exact_d_${randomUUID()}`,
    directSettlement: false,
    localAmount: RECEIVE_LOCAL,
  })

  // Does a USD notional avoid the crypto-cent quantum?
  await attempt("E. directSettlement + amount (USD notional instead of cryptoAmount)", {
    ...base,
    sequenceId: `yc_probe_exact_e_${randomUUID()}`,
    directSettlement: true,
    amount: exactCrypto,
    settlementInfo,
  })

  console.log("=".repeat(78))
  console.log("Read the results as:")
  console.log("- A: compare settlementCryptoAmount + convertedAmount against the 6dp request.")
  console.log("- C/D: exact localAmount lock is only usable if settlementWalletAddress is present.")
  console.log("Pending-approval sends are not funded and expire on their own.")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
