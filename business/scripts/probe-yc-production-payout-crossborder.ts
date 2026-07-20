/**
 * Live production fee probe: YC balance payout (POST /send) + cross-border (POST /send leg2 + POST /receive leg1).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-yc-production-payout-crossborder.ts
 *
 * Env:
 *   YC_PROBE_USER_ID=c7ace38e-be38-43e7-86e1-6e66b90d4243
 *   YC_PROBE_PAYOUT_RECEIVE_NGN=50000
 *   YC_PROBE_CROSS_RECEIVE_KES=10000
 *   YC_PROBE_SKIP_LIVE=1  — DB pricing only, no YC API
 */
import { randomUUID } from "crypto"
import {
  assertYcBalancePayoutEconomicsSufficient,
  assertYcCrossBorderOmnibusSufficient,
  buildYcFundBalanceDisplayFees,
  checkYcCrossBorderOmnibusSufficient,
  computeDisplayProcessingFee,
  computeYcBalancePayoutPricing,
  computeYcBalancePayoutPricingBeforeSend,
  computeYcCrossBorderPricing,
  computeYcCrossBorderPricingBeforeReceive,
  computeYcCrossBorderPrincipalLocalPayIn,
  computePayoutQuoteDisplayProcessingFee,
} from "@easner/shared"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import {
  findYcBalancePayoutRate,
  findYcCrossRate,
  findYcPayInLeg,
  listYcRates,
} from "../lib/fx/yc-rates"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"
import { buildYcKycPersonMetadata } from "../lib/yellowcard/kyc-metadata"
import { submitYcReceive } from "../lib/yellowcard/receive-submit"
import { submitYcSend } from "../lib/yellowcard/send-submit"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import { findYcReceiveChannel } from "../lib/yellowcard/receive-rails"
import { resolveYcSendChannelId } from "../lib/payout-providers/yellowcard-provider"
import { mapRecipientToYcSend } from "../lib/yellowcard/map-recipient-to-yc-send"
import { resolveRecipientPayoutCountry } from "../lib/terminal/recipient-sell-prepare"
import type { RecipientSellPrepareRow } from "../lib/terminal/recipient-sell-prepare"
import { getWalletOwnerId } from "../lib/wallet/resolve-wallet-owner"
import { getActiveWalletAddress } from "../lib/wallet/turnkey-wallet-db"

const USER_ID = String(process.env.YC_PROBE_USER_ID || "c7ace38e-be38-43e7-86e1-6e66b90d4243").trim()
const SKIP_LIVE = process.env.YC_PROBE_SKIP_LIVE === "1"
const PAYOUT_RECEIVE_NGN = Number(process.env.YC_PROBE_PAYOUT_RECEIVE_NGN || "50000")
const CROSS_RECEIVE_KES = Number(process.env.YC_PROBE_CROSS_RECEIVE_KES || "10000")

function fmt(n: number, d = 2) {
  return Number.isFinite(n) ? n.toFixed(d) : "—"
}

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

async function loadUserContext(admin: ReturnType<typeof createSupabaseAdmin>) {
  const { data: userRow, error: userErr } = await admin
    .from("users")
    .select(
      "id,residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", USER_ID)
    .maybeSingle()
  if (userErr || !userRow) throw new Error(userErr?.message || `User ${USER_ID} not found`)

  const userWallet = await (async () => {
    const walletOwnerId = await getWalletOwnerId(admin, "individual", USER_ID)
    if (!walletOwnerId) return null
    return getActiveWalletAddress(admin, walletOwnerId, {
      chain: "solana",
      asset: "USDC",
      ledgerCurrency: "USD",
    })
  })()
  const envOverride = String(process.env.YC_PROBE_TURNKEY_ADDRESS ?? "").trim()
  const omnibusFallback = String(process.env.DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD ?? "").trim()
  const turnkeyAddress = envOverride || userWallet || omnibusFallback || null
  const turnkeyIsProbeFallback = Boolean(
    turnkeyAddress && !userWallet && !envOverride && turnkeyAddress === omnibusFallback,
  )

  const { data: recipients } = await admin
    .from("recipients")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(20)

  return {
    userRow,
    turnkeyAddress,
    turnkeyIsProbeFallback,
    recipients: (recipients ?? []) as RecipientSellPrepareRow[],
  }
}

function pickRecipient(
  recipients: RecipientSellPrepareRow[],
  currency: string,
  excludeSameAsPayIn?: string,
) {
  const cur = currency.toUpperCase()
  for (const r of recipients) {
    const c = String(r.currency || "").toUpperCase()
    const country = resolveRecipientPayoutCountry(r)
    if (c !== cur) continue
    if (excludeSameAsPayIn && country === excludeSameAsPayIn) continue
    return r
  }
  for (const r of recipients) {
    if (String(r.currency || "").toUpperCase() === cur) return r
  }
  return null
}

async function probeBalancePayout(input: {
  admin: ReturnType<typeof createSupabaseAdmin>
  userRow: Record<string, unknown>
  recipient: RecipientSellPrepareRow
  turnkeyAddress: string | null
  turnkeyIsProbeFallback: boolean
}) {
  console.log("\n" + "=".repeat(72))
  console.log("YC BALANCE PAYOUT (USD wallet → local fiat, POST /send)")
  console.log("=".repeat(72))

  const receiveCurrency = String(input.recipient.currency || "NGN").toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(input.recipient)
  if (!countryCode) throw new Error("Payout recipient missing country")

  const rail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)

  const rates = await listYcRates(input.admin, { destinations: [receiveCurrency], status: "active" })
  const payoutRate = findYcBalancePayoutRate(rates, receiveCurrency)
  const customerRate = Number(payoutRate?.rate ?? 0)
  const ycSell = Number(payoutRate?.yc_sell ?? 0)
  const ycBuy = Number(payoutRate?.yc_buy ?? 0)
  if (!(customerRate > 0)) throw new Error(`No USD→${receiveCurrency} payout rate in DB`)

  const receiveAmount = PAYOUT_RECEIVE_NGN
  const provisionalCrypto = Math.round((receiveAmount / customerRate) * 1_000_000) / 1_000_000

  const preview = computeYcBalancePayoutPricingBeforeSend({
    receiveAmount,
    customerRate,
    provisionalCryptoUsd: provisionalCrypto,
    ycMidUsd: ycSell > 0 ? Math.round((receiveAmount / ycSell) * 1_000_000) / 1_000_000 : undefined,
    ycBuyRate: ycSell > 0 ? ycSell : undefined,
  })

  const displayFee = computePayoutQuoteDisplayProcessingFee({
    processingFee: preview.processingFee,
    displayChannelCost: preview.displayChannelCost,
    channelCost: preview.channelCost,
  })

  console.log(`Recipient: ${input.recipient.full_name} (${countryCode}/${receiveCurrency}, ${rail})`)
  console.log(`DB rates: customer=${fmt(customerRate)} yc_sell=${fmt(ycSell)} yc_buy=${fmt(ycBuy)} margin=${payoutRate?.margin_bps ?? "?"}bps`)
  console.log(`Receive target: ${receiveAmount.toLocaleString()} ${receiveCurrency}`)
  console.log("")
  console.log("Easner pricing (before live POST /send):")
  console.log(`  Principal (customer):     $${fmt(preview.customerPrincipal)}`)
  console.log(`  Easner 1%:                $${fmt(preview.processingFee)}`)
  console.log(`  FX margin (in rate):      $${fmt(preview.marginAmount)}`)
  console.log(`  YC leg fees (est.):       $${fmt(preview.channelCost)}`)
  console.log(`  Total debited (wallet):   $${fmt(preview.totalDebited)}`)
  console.log(`  Display processing fee:   $${fmt(displayFee)} (= 1% + YC fees)`)

  if (SKIP_LIVE) {
    console.log("\n[SKIP_LIVE] No POST /send")
    return
  }
  if (!input.turnkeyAddress) {
    console.log("\n[SKIP] No refund address for balance_payout POST /send")
    return
  }
  if (input.turnkeyIsProbeFallback) {
    console.log("\n[WARN] Using deposit omnibus as refund — fee probe only, not a real payout path")
  }

  const channelId = await resolveYcSendChannelId({
    countryCode,
    currencyCode: receiveCurrency,
    rail,
  })
  if (!channelId) throw new Error("No send channel")

  const recipientMapped = await mapRecipientToYcSend(input.recipient, { channelId })
  if (
    recipientMapped.destination.accountType === "momo" &&
    !recipientMapped.destination.accountNumber &&
    recipientMapped.destination.phoneNumber
  ) {
    recipientMapped.destination.accountNumber = recipientMapped.destination.phoneNumber
  }
  const momoPhone = String(recipientMapped.destination.phoneNumber ?? "").trim()
  if (recipientMapped.destination.accountType === "momo" && momoPhone && !momoPhone.startsWith("+")) {
    const cc = receiveCountry === "KE" ? "254" : receiveCountry === "GH" ? "233" : ""
    const digits = momoPhone.replace(/\D/g, "")
    if (cc && digits) {
      const normalized = `+${cc}${digits.replace(/^0/, "")}`
      recipientMapped.destination.phoneNumber = normalized
      recipientMapped.destination.accountNumber = normalized
    }
  }
  const sender = buildYcKycPersonMetadata({ profile: userProfile(input.userRow), requireNgIds: true })
  const sequenceId = `yc_probe_payout_${randomUUID()}`

  let sendRes
  try {
    sendRes = await submitYcSend({
      sequenceId,
      customerUID: USER_ID,
      customerType: "retail",
      channelId,
      currency: receiveCurrency,
      country: countryCode,
      settlementCryptoAmount: provisionalCrypto,
      refundMode: "balance_payout",
      userTurnkeyAddress: input.turnkeyAddress,
      sender,
      destination: recipientMapped.destination,
      sendExtras: recipientMapped.root,
      reason: "probe_balance_payout",
    })
  } catch (e) {
    console.log("\nPOST /send FAILED:", e instanceof Error ? e.message : e)
    return
  }

  const cryptoAmount = Number(sendRes.settlementInfo?.cryptoAmount ?? sendRes.convertedAmount ?? 0)
  const netFee = Number(sendRes.networkFeeAmountUSD ?? 0)
  const svcFee = Number(sendRes.serviceFeeAmountUSD ?? 0)
  const ycLegFees = netFee + svcFee

  const locked = computeYcBalancePayoutPricing({
    receiveAmount,
    customerRate,
    ycFloorUsd: cryptoAmount,
    ycMidUsd: ycSell > 0 ? receiveAmount / ycSell : undefined,
    networkFeeAmountUsd: netFee,
    serviceFeeAmountUsd: svcFee,
  })

  const displayFeeLocked = computePayoutQuoteDisplayProcessingFee({
    processingFee: locked.processingFee,
    displayChannelCost: locked.displayChannelCost,
    channelCost: locked.channelCost,
  })

  let economicsOk = false
  try {
    assertYcBalancePayoutEconomicsSufficient({
      totalDebited: locked.totalDebited,
      cryptoAmount,
      marginAmount: locked.marginAmount,
      processingFee: locked.processingFee,
    })
    economicsOk = true
  } catch {
    economicsOk = false
  }

  console.log("\nYC POST /send (live):")
  console.log(`  cryptoAmount USDC:        $${fmt(cryptoAmount, 6)}`)
  console.log(`  networkFee USD:           $${fmt(netFee, 4)}`)
  console.log(`  serviceFee USD:           $${fmt(svcFee, 4)}`)
  console.log(`  YC rate:                  ${fmt(Number(sendRes.rate ?? 0))}`)
  console.log("")
  console.log("Easner pricing (after live fees):")
  console.log(`  Principal:                $${fmt(locked.customerPrincipal)}`)
  console.log(`  Easner 1%:                $${fmt(locked.processingFee)}`)
  console.log(`  FX margin:                $${fmt(locked.marginAmount)}`)
  console.log(`  YC leg fees:              $${fmt(locked.channelCost)}`)
  console.log(`  Total debited:            $${fmt(locked.totalDebited)}`)
  console.log(`  Display processing fee:   $${fmt(displayFeeLocked)}`)
  console.log(`  Ledger surplus:           $${fmt(locked.totalDebited - cryptoAmount, 4)}`)
  console.log(`  Economics sufficient:     ${economicsOk ? "yes" : "NO"}`)
  console.log("")
  console.log("Preview vs live delta:")
  console.log(`  totalDebited:  $${fmt(preview.totalDebited)} → $${fmt(locked.totalDebited)} (Δ $${fmt(locked.totalDebited - preview.totalDebited, 4)})`)
  console.log(`  YC fees:       $${fmt(preview.channelCost)} → $${fmt(locked.channelCost)} (Δ $${fmt(locked.channelCost - preview.channelCost, 4)})`)
}

async function probeCrossBorder(input: {
  admin: ReturnType<typeof createSupabaseAdmin>
  userRow: Record<string, unknown>
  recipient: RecipientSellPrepareRow
}) {
  console.log("\n" + "=".repeat(72))
  console.log("YC CROSS-BORDER (NGN pay-in → foreign fiat, leg2 /send + leg1 /receive)")
  console.log("=".repeat(72))

  const payInCurrency = "NGN"
  const payInCountry = "NG"
  const payInRail = "bank_transfer" as const
  const receiveCurrency = String(input.recipient.currency || "").toUpperCase()
  const receiveCountry = resolveRecipientPayoutCountry(input.recipient)
  if (!receiveCountry) throw new Error("Cross-border recipient missing country")

  const receiveAmount = CROSS_RECEIVE_KES
  const rates = await listYcRates(input.admin, { status: "active" })
  const cross = findYcCrossRate(rates, payInCurrency, receiveCurrency)
  if (!cross?.rate) throw new Error(`No cross rate ${payInCurrency}→${receiveCurrency}`)

  const fromLeg = findYcPayInLeg(rates, payInCurrency)
  const payoutToLeg = findYcBalancePayoutRate(rates, receiveCurrency)
  const ycBuyFrom = Number(fromLeg?.yc_buy ?? 0)
  const ycSellTo = Number(payoutToLeg?.yc_sell ?? 0)
  const easnerSellFrom = Number(fromLeg?.easner_sell ?? ycBuyFrom)
  if (!(ycBuyFrom > 0 && ycSellTo > 0)) throw new Error("Missing pay-in/payout legs for corridor")

  const zeroFeePreview = computeYcCrossBorderPricing({
    receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: ycBuyFrom,
    ycBuyTo: ycSellTo,
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    sendLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
  })

  const principalLocal = computeYcCrossBorderPrincipalLocalPayIn({
    receiveAmount,
    customerRate: cross.rate,
  })

  console.log(`Corridor: ${payInCurrency} → ${receiveCurrency} (${receiveCountry})`)
  console.log(`Recipient: ${input.recipient.full_name}`)
  console.log(`Cross rate (customer): ${fmt(cross.rate, 6)} ${receiveCurrency}/${payInCurrency}`)
  console.log(`Leg rates: yc_buy_from=${fmt(ycBuyFrom)} yc_sell_to=${fmt(ycSellTo)} easner_sell=${fmt(easnerSellFrom)} yc_cross_mid=${fmt(Number(cross.yc_cross_mid ?? 0), 6)}`)
  console.log(`Receive target: ${receiveAmount.toLocaleString()} ${receiveCurrency}`)
  console.log("")
  console.log("Easner pricing (zero-fee preview — amount screen principal):")
  console.log(`  Principal local:          ₦${fmt(principalLocal, 0)}`)
  console.log(`  Provisional pay-in:       ₦${fmt(zeroFeePreview.provisionalPayIn, 0)}`)
  console.log(`  Full local (zero-fee):    ₦${fmt(zeroFeePreview.localPayIn, 0)}`)

  if (SKIP_LIVE) {
    const padded = computeYcCrossBorderPricingBeforeReceive({
      receiveAmount,
      customerRate: cross.rate,
      ycSellFrom: ycBuyFrom,
      ycBuyTo: ycSellTo,
      easnerSellFrom,
      sendLeg: {
        cryptoAmountUsd: receiveAmount / ycSellTo,
        networkFeeAmountUsd: 0,
        serviceFeeAmountUsd: 0,
      },
    })
    console.log("\nBeforeReceive estimate (send leg provisional, no live fees):")
    console.log(`  localPayIn:               ₦${fmt(padded.localPayIn, 0)}`)
    console.log(`  processingFee:            $${fmt(padded.processingFee)}`)
    console.log(`  marginAmount:             $${fmt(padded.marginAmount)}`)
    console.log(`  ycLegFeesUsd (est.):      $${fmt(padded.ycLegFeesUsd)}`)
    console.log("\n[SKIP_LIVE] No POST /send or POST /receive")
    return
  }

  const sendRail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)

  const sendChannelId = await resolveYcSendChannelId({
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    rail: sendRail,
  })
  if (!sendChannelId) throw new Error("No send channel for destination")

  const channels = await listYellowcardChannels()
  const receiveChannel = findYcReceiveChannel(channels, {
    country: payInCountry,
    currency: payInCurrency,
    rail: payInRail,
  })
  const receiveChannelId = String(receiveChannel?.id ?? receiveChannel?.channelId ?? "")
  if (!receiveChannelId) throw new Error("No NG receive channel")

  const recipientMapped = await mapRecipientToYcSend(input.recipient, { channelId: sendChannelId })
  if (
    recipientMapped.destination.accountType === "momo" &&
    !recipientMapped.destination.accountNumber &&
    recipientMapped.destination.phoneNumber
  ) {
    recipientMapped.destination.accountNumber = recipientMapped.destination.phoneNumber
  }
  const momoPhone = String(recipientMapped.destination.phoneNumber ?? "").trim()
  if (recipientMapped.destination.accountType === "momo" && momoPhone && !momoPhone.startsWith("+")) {
    const cc = receiveCountry === "KE" ? "254" : receiveCountry === "GH" ? "233" : ""
    const digits = momoPhone.replace(/\D/g, "")
    if (cc && digits) {
      const normalized = `+${cc}${digits.replace(/^0/, "")}`
      recipientMapped.destination.phoneNumber = normalized
      recipientMapped.destination.accountNumber = normalized
    }
  }
  const sender = buildYcKycPersonMetadata({ profile: userProfile(input.userRow), requireNgIds: true })

  const provisionalSendCrypto = Math.round((receiveAmount / ycSellTo) * 1_000_000) / 1_000_000
  let sendRes
  try {
    sendRes = await submitYcSend({
      sequenceId: `yc_probe_cb_l2_${randomUUID()}`,
      customerUID: USER_ID,
      channelId: sendChannelId,
      currency: receiveCurrency,
      country: receiveCountry,
      settlementCryptoAmount: provisionalSendCrypto,
      refundMode: "cross_border_send",
      sender,
      destination: recipientMapped.destination,
      sendExtras: recipientMapped.root,
      reason: "probe_cross_border_leg2",
    })
  } catch (e) {
    console.log("\nLeg2 POST /send FAILED:", e instanceof Error ? e.message : e)
    return
  }

  const sendLeg = {
    cryptoAmountUsd: Number(sendRes.settlementInfo?.cryptoAmount ?? 0),
    networkFeeAmountUsd: Number(sendRes.networkFeeAmountUSD ?? 0),
    serviceFeeAmountUsd: Number(sendRes.serviceFeeAmountUSD ?? 0),
  }

  const beforeReceive = computeYcCrossBorderPricingBeforeReceive({
    receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: ycBuyFrom,
    ycBuyTo: ycSellTo,
    easnerSellFrom,
    sendLeg,
  })

  const localAmount = Math.ceil(beforeReceive.localPayIn)
  let receiveRes
  try {
    receiveRes = await submitYcReceive({
      sequenceId: `yc_probe_cb_l1_${randomUUID()}`,
      customerUID: USER_ID,
      channelId: receiveChannelId,
      currency: payInCurrency,
      country: payInCountry,
      localAmount,
      recipient: sender,
      payInRail,
      reason: "probe_cross_border_leg1",
    })
  } catch (e) {
    console.log("\nLeg1 POST /receive FAILED:", e instanceof Error ? e.message : e)
    console.log(`  (attempted localAmount ₦${localAmount.toLocaleString()})`)
    return
  }

  const receiveLeg = {
    cryptoAmountUsd: Number(receiveRes.settlementInfo?.cryptoAmount ?? 0),
    networkFeeAmountUsd: Number(receiveRes.networkFeeAmountUSD ?? 0),
    serviceFeeAmountUsd: Number(receiveRes.serviceFeeAmountUSD ?? 0),
  }

  const final = computeYcCrossBorderPricing({
    receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_buy ?? receiveRes.rate ?? ycBuyFrom),
    ycBuyTo: Number(payoutToLeg?.yc_sell ?? sendRes.rate ?? ycSellTo),
    receiveLeg,
    sendLeg,
  })

  const displayFees = buildYcFundBalanceDisplayFees({
    usdCredit: Math.max(final.processingFee / 0.01, 0),
    processingFee: final.processingFee,
    ycLegFeesUsd: final.ycLegFeesUsd,
    easnerSellRate: easnerSellFrom,
    payInCurrency,
  })
  const displayProcessingFeeUsd = computeDisplayProcessingFee({
    processingFee: final.processingFee,
    exchangeFee: final.ycLegFeesUsd,
  })

  const omnibus = checkYcCrossBorderOmnibusSufficient({
    receiveCryptoUsd: receiveLeg.cryptoAmountUsd,
    sendCryptoUsd: sendLeg.cryptoAmountUsd,
    processingFee: final.processingFee,
    marginAmount: final.marginAmount,
  })

  let omnibusAssert = false
  try {
    assertYcCrossBorderOmnibusSufficient({
      receiveCryptoUsd: receiveLeg.cryptoAmountUsd,
      sendCryptoUsd: sendLeg.cryptoAmountUsd,
      processingFee: final.processingFee,
      marginAmount: final.marginAmount,
    })
    omnibusAssert = true
  } catch {
    omnibusAssert = false
  }

  const lockedLocal = Number(receiveRes.localAmount ?? localAmount)

  console.log("\nLeg2 POST /send (live):")
  console.log(`  send crypto USDC:         $${fmt(sendLeg.cryptoAmountUsd, 6)}`)
  console.log(`  send networkFee:          $${fmt(sendLeg.networkFeeAmountUsd, 4)}`)
  console.log(`  send serviceFee:          $${fmt(sendLeg.serviceFeeAmountUsd, 4)}`)

  console.log("\nLeg1 POST /receive (live):")
  console.log(`  localAmount sent/locked:  ₦${fmt(localAmount, 0)} / ₦${fmt(lockedLocal, 0)}`)
  console.log(`  receive crypto USDC:      $${fmt(receiveLeg.cryptoAmountUsd, 6)}`)
  console.log(`  receive networkFee:       $${fmt(receiveLeg.networkFeeAmountUsd, 4)}`)
  console.log(`  receive serviceFee:       $${fmt(receiveLeg.serviceFeeAmountUsd, 4)}`)

  console.log("\nEasner pricing (locked, both legs):")
  console.log(`  Principal local:          ₦${fmt(principalLocal, 0)}`)
  console.log(`  Total local pay-in:       ₦${fmt(final.localPayIn, 0)} (quoted) / ₦${fmt(lockedLocal, 0)} (YC locked)`)
  console.log(`  Recipient gets:           ${receiveAmount.toLocaleString()} ${receiveCurrency}`)
  console.log(`  Easner 1%:                $${fmt(final.processingFee)}`)
  console.log(`  FX margin:                $${fmt(final.marginAmount)}`)
  console.log(`  YC leg fees (both):       $${fmt(final.ycLegFeesUsd)}`)
  console.log(`  Display processing (USD): $${fmt(displayProcessingFeeUsd)}`)
  console.log(`  Display processing (NGN): ₦${fmt(displayFees.displayProcessingFeeLocal ?? 0, 0)}`)
  console.log(`  Omnibus sufficient:       ${omnibus.ok ? "yes" : `NO (need $${fmt(omnibus.requiredOmnibus)}, got $${fmt(omnibus.cryptoAmount)})`}`)
  console.log(`  Assert pass:              ${omnibusAssert ? "yes" : "NO"}`)
}

async function main() {
  console.log("=== YC production payout + cross-border fee probe ===")
  console.log("environment:", getYellowcardEnvironment())
  console.log("user:", USER_ID)
  console.log("skip live YC API:", SKIP_LIVE)

  const admin = createSupabaseAdmin()
  const ctx = await loadUserContext(admin)

  console.log(`turnkey address: ${ctx.turnkeyAddress ?? "(none)"}`)
  console.log(`recipients: ${ctx.recipients.length}`)

  const ngnRecipient =
    ctx.recipients.find((r) => r.id === "7039ea8a-bafe-47e6-9854-aff0e56f9c79") ??
    pickRecipient(ctx.recipients, "NGN")
  const foreignRecipient =
    ctx.recipients.find((r) => r.id === "da39e911-2ad3-4858-a6ed-e8a5d1618eaa") ??
    pickRecipient(ctx.recipients, "KES") ??
    pickRecipient(ctx.recipients, "GHS") ??
    pickRecipient(ctx.recipients, "UGX") ??
    ctx.recipients.find((r) => {
      const c = String(r.currency || "").toUpperCase()
      return c && c !== "NGN" && c !== "USD"
    }) ??
    null

  if (!ngnRecipient) {
    console.log("\n[WARN] No NGN recipient — payout probe skipped")
  } else {
    await probeBalancePayout({
      admin,
      userRow: ctx.userRow as Record<string, unknown>,
      recipient: ngnRecipient,
      turnkeyAddress: ctx.turnkeyAddress,
      turnkeyIsProbeFallback: ctx.turnkeyIsProbeFallback,
    })
  }

  if (!foreignRecipient) {
    console.log("\n[WARN] No foreign-currency recipient — cross-border probe skipped")
    console.log("Available:", ctx.recipients.map((r) => `${r.currency}/${resolveRecipientPayoutCountry(r)}`).join(", ") || "(none)")
  } else {
    await probeCrossBorder({
      admin,
      userRow: ctx.userRow as Record<string, unknown>,
      recipient: foreignRecipient,
    })
  }

  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
