/**
 * Unfunded YC direct-settlement precision/lifetime probe.
 *
 * Required:
 *   YC_PRECISION_PROBE_ACK=UNFUNDED_ONLY
 *   YC_PROBE_USER_ID=<user uuid>
 *   YC_PROBE_RECIPIENT_ID=<recipient uuid>
 * Optional:
 *   YC_PROBE_TURNKEY_ADDRESS=<USDC Solana refund/sender address>
 *   When omitted, the probe resolves the user's active USD/USDC Solana wallet.
 *
 * Submit mode creates forceAccept=false sends for four fixed amounts and never transfers crypto.
 * Inspect mode: YC_PROBE_SEND_IDS=id1,id2,... re-fetches prior sends after the YC quote TTL.
 */
import { randomUUID } from "crypto"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { yellowcardFetch } from "../lib/yellowcard/http"
import { submitYcSend, type YcSendSubmitResult } from "../lib/yellowcard/send-submit"
import { buildYcKycPersonMetadata } from "../lib/yellowcard/kyc-metadata"
import { mapRecipientToYcSend } from "../lib/yellowcard/map-recipient-to-yc-send"
import { resolveYcSendChannelId } from "../lib/payout-providers/yellowcard-provider"
import { resolveRecipientPayoutCountry, type RecipientSellPrepareRow } from "../lib/terminal/recipient-sell-prepare"
import { getWalletOwnerId } from "../lib/wallet/resolve-wallet-owner"
import { getActiveWalletAddress } from "../lib/wallet/turnkey-wallet-db"
import { findYcBalancePayoutRate, listYcRates } from "../lib/fx/yc-rates"
import { fetchYcSendServiceFeeConfig } from "../lib/yellowcard/send-fee-config"
import { submitYcSendWithDestinationAmountLock } from "../lib/yellowcard/yc-send-leg-lock"
import {
  estimateYcSendLegSettlementCryptoForQuotedReceive,
  readYcSendLegFeeLocal,
  readYcSendLockedLocalAmount,
} from "@easner/shared"

export const YC_PRECISION_PROBE_AMOUNTS = [1.468, 1.468537, 1.469, 1.47] as const

function probeAmounts(): number[] {
  const raw = String(process.env.YC_PROBE_AMOUNTS ?? "").trim()
  if (!raw) return [...YC_PRECISION_PROBE_AMOUNTS]
  const values = raw.split(",").map((value) => Number(value.trim()))
  if (!values.length || values.length > 12 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("YC_PROBE_AMOUNTS must contain 1-12 positive comma-separated USDC amounts.")
  }
  return values
}

function summary(requestedCrypto: number | null, result: YcSendSubmitResult) {
  const grossLocal = readYcSendLockedLocalAmount(result as Record<string, unknown>) ?? 0
  const feeLocal = readYcSendLegFeeLocal(result as Record<string, unknown>)
  return {
    requestedCrypto,
    sendId: result.id ?? null,
    status: result.status ?? null,
    acceptedCrypto: result.settlementInfo?.cryptoAmount ?? null,
    convertedAmount: result.convertedAmount ?? null,
    localAmount: result.localAmount ?? null,
    rate: result.rate ?? null,
    networkFeeAmountUSD: result.networkFeeAmountUSD ?? null,
    serviceFeeAmountUSD: result.serviceFeeAmountUSD ?? null,
    networkFeeAmountLocal: result.networkFeeAmountLocal ?? null,
    serviceFeeAmountLocal: result.serviceFeeAmountLocal ?? null,
    partnerFeeAmountUSD: result.partnerFeeAmountUSD ?? null,
    partnerFeeAmountLocal: result.partnerFeeAmountLocal ?? null,
    effectiveRecipientAmount: grossLocal > 0 ? Math.round((grossLocal - feeLocal) * 100) / 100 : null,
    expiresAt:
      (result as { expiresAt?: string; expires_at?: string }).expiresAt ??
      (result as { expires_at?: string }).expires_at ??
      null,
  }
}

async function inspect(ids: string[]) {
  for (const id of ids) {
    const result = await yellowcardFetch<YcSendSubmitResult>({
      method: "GET",
      path: `/send/${encodeURIComponent(id)}`,
    })
    console.log(JSON.stringify(summary(null, result)))
  }
}

async function main() {
  if (process.env.YC_PRECISION_PROBE_ACK !== "UNFUNDED_ONLY") {
    throw new Error("Set YC_PRECISION_PROBE_ACK=UNFUNDED_ONLY; this probe must never be funded.")
  }
  const inspectIds = String(process.env.YC_PROBE_SEND_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (inspectIds.length) return inspect(inspectIds)

  const userId = String(process.env.YC_PROBE_USER_ID ?? "").trim()
  const recipientId = String(process.env.YC_PROBE_RECIPIENT_ID ?? "").trim()
  if (!userId || !recipientId) {
    throw new Error("YC_PROBE_USER_ID and YC_PROBE_RECIPIENT_ID are required.")
  }

  const admin = createSupabaseAdmin()
  const walletOwnerId = await getWalletOwnerId(admin, "individual", userId)
  const resolvedTurnkeyAddress = walletOwnerId
    ? await getActiveWalletAddress(admin, walletOwnerId, "solana", "USDC", "USD")
    : null
  const turnkeyAddress =
    String(process.env.YC_PROBE_TURNKEY_ADDRESS ?? "").trim() || resolvedTurnkeyAddress
  if (!turnkeyAddress) {
    throw new Error("No active USD/USDC Solana wallet was found for the probe user.")
  }
  const [{ data: user }, { data: recipient }] = await Promise.all([
    admin.from("users").select("*").eq("id", userId).maybeSingle(),
    admin.from("recipients").select("*").eq("id", recipientId).eq("user_id", userId).maybeSingle(),
  ])
  if (!user || !recipient) throw new Error("Probe user or recipient was not found.")
  const row = recipient as RecipientSellPrepareRow
  const country = resolveRecipientPayoutCountry(row)
  const currency = String(row.currency ?? "").toUpperCase()
  const rail = row.mobile_provider ? "mobile_money" : "bank_transfer"
  if (!country || !currency) throw new Error("Probe recipient country/currency is incomplete.")
  const channelId = await resolveYcSendChannelId({ countryCode: country, currencyCode: currency, rail })
  if (!channelId) throw new Error("No YC send channel for probe recipient.")
  const mapped = await mapRecipientToYcSend(row, { channelId })
  const sender = buildYcKycPersonMetadata({
    profile: {
      residenceCountry: user.residence_country,
      kycIdType: user.kyc_id_type,
      kycIdNumber: user.kyc_id_number,
      ngLocalIdType: user.ng_local_id_type,
      ngLocalIdNumber: user.ng_local_id_number,
      fullName: user.full_name,
      phone: user.phone,
      email: user.email,
      dateOfBirth: user.date_of_birth,
      addressStreet: user.kyc_address_street,
      addressCity: user.kyc_address_city,
      addressCountry: user.kyc_address_country,
    },
    requireNgIds: country === "NG",
  })

  const adaptiveTarget = Number(process.env.YC_PROBE_TARGET_LOCAL ?? 0)
  if (Number.isFinite(adaptiveTarget) && adaptiveTarget > 0) {
    const rates = await listYcRates(admin, { destinations: [currency], status: "active" })
    const payoutRate = findYcBalancePayoutRate(rates, currency)
    const ycSellRate = Number(payoutRate?.yc_sell ?? 0)
    if (!(ycSellRate > 0)) throw new Error(`No active YC sell rate for ${currency}.`)
    const feeConfig = await fetchYcSendServiceFeeConfig({
      country,
      currency,
      channelType: rail === "mobile_money" ? "momo" : "bank",
      directSettlement: true,
      fresh: true,
    })
    const initialSettlementCryptoUsd = estimateYcSendLegSettlementCryptoForQuotedReceive({
      quotedReceive: adaptiveTarget,
      destinationRate: ycSellRate,
      ycSellRate,
      feeConfig,
    })
    const lock = await submitYcSendWithDestinationAmountLock({
      receiveAmount: adaptiveTarget,
      initialSettlementCryptoUsd,
      destinationRate: ycSellRate,
      ycSellRate,
      receiveCurrency: currency,
      sequenceIdPrefix: "yc_precision_probe_lock",
      feeConfig,
      parallelBoundaryProbe: true,
      buildSubmit: ({ settlementCryptoUsd, sequenceId }) =>
        submitYcSend({
          sequenceId,
          customerUID: userId,
          channelId,
          currency,
          country,
          forceAccept: false,
          settlementCryptoAmount: settlementCryptoUsd,
          refundMode: "balance_payout",
          userTurnkeyAddress: turnkeyAddress,
          sender,
          destination: mapped.destination,
          sendExtras: mapped.root,
          reason: "yc_precision_probe_adaptive_unfunded",
        }),
    })
    console.log(JSON.stringify({
      mode: "adaptive_lock",
      requestedRecipientAmount: adaptiveTarget,
      actualRecipientAmount: lock.recipientLocalAmount,
      grossLocalAmount: lock.lockedLocalAmount,
      feeLocalAmount: lock.sendLegFeeLocal,
      cryptoFundingAmount: lock.finalSettlementCryptoUsd,
      surplusLocal: lock.recipientSurplusLocal,
      payoutQuantumLocal: lock.payoutQuantumLocal,
      settlementQuantumUsd: lock.settlementQuantumUsd,
      precisionMode: lock.precisionMode,
      selectedSendId: lock.sendRes.id ?? null,
      discardedSendIds: lock.discardedSendIds,
      expiresAt: lock.expiresAt ?? null,
    }))
    return
  }

  for (const amount of probeAmounts()) {
    const result = await submitYcSend({
      sequenceId: `yc_precision_probe_${randomUUID()}`,
      customerUID: userId,
      channelId,
      currency,
      country,
      forceAccept: false,
      settlementCryptoAmount: amount,
      refundMode: "balance_payout",
      userTurnkeyAddress: turnkeyAddress,
      sender,
      destination: mapped.destination,
      sendExtras: mapped.root,
      reason: "yc_precision_probe_unfunded",
    })
    console.log(JSON.stringify(summary(amount, result)))
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
