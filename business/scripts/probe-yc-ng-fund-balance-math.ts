/**
 * Compare Easner fund-balance pricing vs live YC POST /receive for NG bank pay-in.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-yc-ng-fund-balance-math.ts
 *
 * Optional:
 *   YC_PROBE_USER_ID=c7ace38e-be38-43e7-86e1-6e66b90d4243
 *   YC_PROBE_USD_AMOUNTS=1.79,10,50,100
 *   YC_PROBE_DRY_RUN=1   – skip POST /receive (pricing math only)
 */
import { randomUUID } from "crypto"
import {
  computeYcFundBalanceAmountPreview,
  computeYcFundBalancePricing,
  computeYcFundBalancePricingBeforeReceive,
  computeYcFundBalanceSendExactlyLocal,
  resolveYcFundBalanceSubmitLocalPayIn,
  checkYcFundBalanceOmnibusSufficient,
  buildYcFundBalanceDisplayFees,
  YC_FUND_BALANCE_OMNIBUS_SOLVE_BUFFER_USDC,
} from "@easner/shared"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { findYcPayInLeg, listYcRates } from "../lib/fx/yc-rates"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import { findYcReceiveChannel } from "../lib/yellowcard/receive-rails"
import { buildYcKycPersonMetadata } from "../lib/yellowcard/kyc-metadata"
import { submitYcReceive, type YcReceiveSubmitResult } from "../lib/yellowcard/receive-submit"

const USER_ID = String(process.env.YC_PROBE_USER_ID || "c7ace38e-be38-43e7-86e1-6e66b90d4243").trim()
const DRY_RUN = process.env.YC_PROBE_DRY_RUN === "1"
const USD_AMOUNTS = String(process.env.YC_PROBE_USD_AMOUNTS || "1.79,10,50,100")
  .split(",")
  .map((s) => Number.parseFloat(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)

function fmt(n: number, d = 2) {
  return Number.isFinite(n) ? n.toFixed(d) : "–"
}

function pricingNoBuffer(usdCredit: number, customerSellRate: number, ycSellRate: number) {
  return computeYcFundBalancePricing({
    usdCredit,
    customerSellRate,
    ycSellRate,
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
  })
}

function pricingEstimatedFees(usdCredit: number, customerSellRate: number, ycSellRate: number) {
  return computeYcFundBalancePricingBeforeReceive({
    usdCredit,
    customerSellRate,
    ycSellRate,
    rail: "bank_transfer",
  })
}

async function main() {
  console.log("=== YC NG fund-balance math probe ===")
  console.log("environment:", getYellowcardEnvironment())
  console.log("user:", USER_ID)
  console.log("dry run (no POST /receive):", DRY_RUN)
  console.log("flat solve buffer USDC:", YC_FUND_BALANCE_OMNIBUS_SOLVE_BUFFER_USDC)
  console.log("")

  const admin = createSupabaseAdmin()
  const { data: userRow, error: userErr } = await admin
    .from("users")
    .select(
      "id,residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", USER_ID)
    .maybeSingle()

  if (userErr || !userRow) {
    throw new Error(userErr?.message || `User ${USER_ID} not found`)
  }

  const country = String(userRow.residence_country || "NG").trim().toUpperCase()
  const currency = "NGN"
  const rates = await listYcRates(admin, { status: "active" })
  const leg = findYcPayInLeg(rates, currency)
  if (!leg?.easner_sell || !leg.yc_buy) {
    throw new Error("NGN pay-in rate leg missing easner_sell/yc_buy")
  }

  const customerSellRate = Number(leg.easner_sell)
  const ycPayInRate = Number(leg.yc_buy)
  console.log("DB rates (NGN→USDC):")
  console.log(`  yc_buy=${fmt(ycPayInRate)} yc_sell=${fmt(Number(leg.yc_sell ?? 0))} easner_sell=${fmt(customerSellRate)} margin=${leg.margin_bps}bps as_of=${leg.as_of}`)
  console.log("")

  const channels = DRY_RUN
    ? []
    : await listYellowcardChannels()
  const channel = DRY_RUN
    ? { id: "dry-run" }
    : findYcReceiveChannel(channels, { country, currency, rail: "bank_transfer" })
  const channelId = String(channel?.id ?? channel?.channelId ?? "")
  if (!DRY_RUN && !channelId) throw new Error("NG bank receive channel not found")

  const recipient = buildYcKycPersonMetadata({
    profile: {
      residenceCountry: userRow.residence_country ?? country,
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
  })

  for (const usdCredit of USD_AMOUNTS) {
    console.log("=".repeat(72))
    console.log(`USD credit target: $${fmt(usdCredit)}`)

    const noBuf = pricingNoBuffer(usdCredit, customerSellRate, ycPayInRate)
    const estFees = pricingEstimatedFees(usdCredit, customerSellRate, ycPayInRate)
    const submitLocal = resolveYcFundBalanceSubmitLocalPayIn({
      pricing: estFees,
      customerSellRate,
    })
    const previewHook = computeYcFundBalanceAmountPreview({
      amountEntryMode: "usd",
      enteredAmount: usdCredit,
      customerSellRate,
      ycSellRate: ycPayInRate,
      rail: "bank_transfer",
    })
    const noahStylePrincipal = usdCredit * customerSellRate
    const displayFees = buildYcFundBalanceDisplayFees({
      usdCredit: noBuf.usdCredit,
      processingFee: noBuf.processingFee,
      ycLegFeesUsd: estFees.ycLegFeesUsd,
      easnerSellRate: customerSellRate,
      payInCurrency: currency,
    })
    const noahStyleTotal = computeYcFundBalanceSendExactlyLocal({
      usdCredit,
      customerSellRate,
      displayProcessingFeeLocal: displayFees.displayProcessingFeeLocal ?? 0,
    })

    console.log("")
    console.log("Easner pricing models (local NGN):")
    console.log(`  A) Principal only (usd × easner_sell):     ₦${fmt(noahStylePrincipal, 0)}`)
    console.log(`  B) Noah-style (principal + display fees):  ₦${fmt(noahStyleTotal, 0)}`)
    console.log(`  C) Zero-fee leg pricing (1% Easner in):   ₦${fmt(noBuf.localPayIn, 0)}  proc=$${fmt(noBuf.processingFee)}`)
    console.log(`  D) BeforeReceive estimate (current UI):    ₦${fmt(estFees.localPayIn, 0)}  ycFees=$${fmt(estFees.ycLegFeesUsd)}`)
    console.log(`  E) Submit local (+ ${YC_FUND_BALANCE_OMNIBUS_SOLVE_BUFFER_USDC} USDC buffer): ₦${fmt(submitLocal, 0)}`)
    console.log(`  F) useYcFundBalanceFlow preview hook:      ₦${fmt(previewHook?.localPayIn ?? 0, 0)}`)

    if (DRY_RUN) continue

    const localAmount = Math.ceil(submitLocal)
    let receiveRes: YcReceiveSubmitResult
    try {
      receiveRes = await submitYcReceive({
        sequenceId: `yc_math_probe_${randomUUID()}`,
        customerUID: USER_ID,
        channelType: "bank",
        currency,
        country,
        localAmount,
        recipient,
        payInRail: "bank_transfer",
        reason: "fund_balance",
      })
    } catch (e) {
      console.log("")
      console.log("YC POST /receive FAILED:", e instanceof Error ? e.message : e)
      continue
    }

    const crypto = Number(receiveRes.settlementInfo?.cryptoAmount ?? 0)
    const lockedLocal = Number(receiveRes.localAmount ?? localAmount)
    const netFee = Number(receiveRes.networkFeeAmountUSD ?? 0)
    const svcFee = Number(receiveRes.serviceFeeAmountUSD ?? 0)
    const ycRate = Number(receiveRes.rate ?? 0)
    const omnibus = checkYcFundBalanceOmnibusSufficient({
      cryptoAmount: crypto,
      usdCredit: noBuf.usdCredit,
      processingFee: noBuf.processingFee,
    })

    console.log("")
    console.log("YC POST /receive (live):")
    console.log(`  localAmount sent:  ₦${fmt(localAmount, 0)}`)
    console.log(`  localAmount locked: ₦${fmt(lockedLocal, 0)}`)
    console.log(`  cryptoAmount USDC: $${fmt(crypto, 6)}`)
    console.log(`  networkFee USD:    $${fmt(netFee, 4)}`)
    console.log(`  serviceFee USD:    $${fmt(svcFee, 4)}`)
    console.log(`  YC rate field:     ${fmt(ycRate)}`)
    console.log(`  omnibus sufficient: ${omnibus.ok ? "yes" : `NO (need $${fmt(omnibus.requiredOmnibus)}, got $${fmt(omnibus.cryptoAmount)})`}`)
    console.log(`  implied credit @ easner_sell: $${fmt(lockedLocal / customerSellRate - noBuf.processingFee, 4)}`)
  }

  console.log("")
  console.log("Done.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
