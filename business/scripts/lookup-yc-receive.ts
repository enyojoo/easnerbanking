/**
 * Lookup YC receive by id or sequenceId.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/lookup-yc-receive.ts <ycId> [sequenceId]
 */
import { yellowcardFetch } from "../lib/yellowcard/http"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"
import {
  computeYcFundBalancePricing,
  buildYcFundBalanceDisplayFees,
  checkYcFundBalanceOmnibusSufficient,
  resolveYcFundBalanceLocalPayInBreakdownForDisplay,
} from "@easner/shared"

const ycId = process.argv[2]?.trim()
const sequenceId = process.argv[3]?.trim()

async function lookup(path: string) {
  return yellowcardFetch<Record<string, unknown>>({ method: "GET", path })
}

async function main() {
  console.log("environment:", getYellowcardEnvironment())
  let receive: Record<string, unknown> | null = null
  if (ycId) {
    console.log("\n=== GET /receive/" + ycId + " ===")
    receive = await lookup(`/receive/${ycId}`)
    console.log(JSON.stringify(receive, null, 2))
  }
  if (sequenceId) {
    console.log("\n=== GET /receive/sequence-id/" + sequenceId + " ===")
    const bySeq = await lookup(`/receive/sequence-id/${sequenceId}`)
    console.log(JSON.stringify(bySeq, null, 2))
    if (!receive) receive = bySeq
  }
  if (!receive) throw new Error("Provide ycId and/or sequenceId")

  const settlement = (receive.settlementInfo ?? receive.settlement_info) as
    | Record<string, unknown>
    | undefined
  const crypto = Number(settlement?.cryptoAmount ?? settlement?.crypto_amount ?? 0)
  const localAmount = Number(receive.localAmount ?? receive.local_amount ?? 0)
  const netFee = Number(receive.networkFeeAmountUSD ?? receive.network_fee_amount_usd ?? 0)
  const svcFee = Number(receive.serviceFeeAmountUSD ?? receive.service_fee_amount_usd ?? 0)
  const rate = Number(receive.rate ?? 0)
  const status = String(receive.status ?? "")

  // DB snapshot from user query (ETID35098611)
  const db = {
    quotedPayIn: 2590.01,
    quotedReceive: 1.77,
    customerRate: 1417.0854271357,
    processingFee: 0.0177,
    ycLegFeesUsd: 0.04,
    marginAmount: 0.000002,
    omnibusExpected: 1.8250192,
    displayProcessingFee: 0.0577,
    displayProcessingFeeLocal: 81.76,
    principalLocal: 2508.24,
  }

  const lockedLocal = db.quotedPayIn
  const ycFeesFromApi = netFee + svcFee
  const ycRateField = rate > 0 ? rate : 1410

  const pricingFromLocked = computeYcFundBalancePricing({
    localPayIn: lockedLocal,
    customerSellRate: db.customerRate,
    ycSellRate: ycRateField,
    receiveLeg: {
      cryptoAmountUsd: crypto || db.omnibusExpected,
      networkFeeAmountUsd: netFee,
      serviceFeeAmountUsd: svcFee,
    },
  })

  const pricingFromTarget = computeYcFundBalancePricing({
    usdCredit: db.quotedReceive,
    customerSellRate: db.customerRate,
    ycSellRate: ycRateField,
    receiveLeg: {
      cryptoAmountUsd: crypto || db.omnibusExpected,
      networkFeeAmountUsd: netFee,
      serviceFeeAmountUsd: svcFee,
    },
  })

  const displayFeesFromLocked = buildYcFundBalanceDisplayFees({
    usdCredit: pricingFromLocked.usdCredit,
    processingFee: pricingFromLocked.processingFee,
    ycLegFeesUsd: pricingFromLocked.ycLegFeesUsd,
    easnerSellRate: db.customerRate,
    payInCurrency: "NGN",
  })

  const breakdown = resolveYcFundBalanceLocalPayInBreakdownForDisplay({
    localPayIn: lockedLocal,
    localCurrency: "NGN",
    usdCredit: db.quotedReceive,
    exchangeRate: db.customerRate,
    displayProcessingFeeLocal: displayFeesFromLocked.displayProcessingFeeLocal,
    processingFee: pricingFromLocked.processingFee,
    exchangeFee: pricingFromLocked.ycLegFeesUsd,
  })

  const omnibusCheck = checkYcFundBalanceOmnibusSufficient({
    cryptoAmount: crypto || db.omnibusExpected,
    usdCredit: db.quotedReceive,
    processingFee: pricingFromLocked.processingFee,
  })

  const convertedAmount = Number(receive.convertedAmount ?? 0)
  const amountUsd = Number(receive.amount ?? 0)

  console.log("\n=== YC API fields ===")
  console.log("status:", status)
  console.log("amount (USD submitted):", amountUsd)
  console.log("convertedAmount (NGN):", convertedAmount)
  console.log("rate (YC):", ycRateField)
  console.log("networkFee USD/local:", netFee, Number(receive.networkFeeAmountLocal ?? 0))
  console.log("serviceFee USD/local:", svcFee, Number(receive.serviceFeeAmountLocal ?? 0))
  console.log("settlement cryptoAmount:", crypto)
  console.log("reference:", receive.reference)

  console.log("\n=== Reconciliation vs DB (ETID35098611) ===")
  console.log("")
  console.log("Field                    | YC API live      | DB stored        | Easner recompute")
  console.log("-".repeat(88))
  const row = (label: string, api: unknown, dbv: unknown, calc: unknown) => {
    const f = (v: unknown) => (typeof v === "number" ? v.toFixed(6) : String(v))
    console.log(
      `${label.padEnd(24)} | ${f(api).padStart(16)} | ${f(dbv).padStart(16)} | ${f(calc).padStart(16)}`,
    )
  }
  row("local pay-in (NGN)", convertedAmount, db.quotedPayIn, pricingFromLocked.localPayIn)
  row("USD credit (target)", amountUsd, db.quotedReceive, pricingFromLocked.usdCredit)
  row("USD credit (solve fwd)", "", db.quotedReceive, pricingFromTarget.usdCredit)
  row("processing fee USD", "", db.processingFee, pricingFromLocked.processingFee)
  row("YC leg fees USD", ycFeesFromApi, db.ycLegFeesUsd, pricingFromLocked.ycLegFeesUsd)
  row("omnibus USDC", crypto, db.omnibusExpected, pricingFromLocked.omnibusInUsd)
  row("margin USD", "", db.marginAmount, pricingFromLocked.marginAmount)
  row("display proc fee USD", "", db.displayProcessingFee, displayFeesFromLocked.displayProcessingFee)
  row(
    "display proc fee NGN",
    "",
    db.displayProcessingFeeLocal,
    displayFeesFromLocked.displayProcessingFeeLocal,
  )
  row("principal local NGN", "", db.principalLocal, breakdown.principalLocal)
  row("fee local NGN (UI)", "", db.displayProcessingFeeLocal, breakdown.feeLocal)
  console.log("")
  console.log("convertedAmount vs quoted_pay_in delta NGN:", (convertedAmount - db.quotedPayIn).toFixed(2))
  console.log("Omnibus sufficient (credit + 1% proc):", omnibusCheck.ok ? "YES" : "NO")
  console.log("  required:", omnibusCheck.requiredOmnibus, "actual:", omnibusCheck.cryptoAmount)
  console.log("  surplus USDC (→ fee wallet):", (omnibusCheck.cryptoAmount - omnibusCheck.requiredOmnibus).toFixed(6))
  console.log("  margin_amount in DB (FX spread):", db.marginAmount)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
