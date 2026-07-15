import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { computeYcFundBalancePricing, YC_QUOTE_TTL_MS } from "@easner/shared"
import { findYcRate, listYcRates } from "@/lib/fx/yc-rates"
import { submitYcReceive } from "@/lib/yellowcard/receive-submit"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { buildYcFundBalanceReceiveMetadata } from "@/lib/yellowcard/yc-ledger"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"

export const runtime = "nodejs"

/**
 * Create a YC local fund_balance receive session (dynamic VA / MoMo).
 * Supports individual + business scope (org owner KYC for YC person metadata).
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response
  const noahCtx = noahCtxResult

  const body = (await request.json().catch(() => null)) as {
    currency?: string
    country?: string
    usdCredit?: number
    localPayIn?: number
    rail?: "bank_transfer" | "mobile_money"
  } | null

  const currency = String(body?.currency ?? "").trim().toUpperCase()
  const country = String(body?.country ?? "").trim().toUpperCase()
  if (!currency || !country) {
    return NextResponse.json({ error: "currency and country required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const orgOwnerId =
    noahCtx.scope === "business" && noahCtx.businessId
      ? await resolveBusinessOrgOwnerUserId(admin, noahCtx.businessId).catch(() => null)
      : null
  const kycUserId = orgOwnerId ?? user.id

  const { data: userRow } = await admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", kycUserId)
    .maybeSingle()

  const rates = await listYcRates(admin, { status: "active" })
  const leg = findYcRate(rates, currency, "USDC")
  if (!leg?.easner_sell || !leg.yc_sell) {
    return NextResponse.json({ error: "YC rate unavailable for currency" }, { status: 400 })
  }

  const rail = body?.rail === "mobile_money" ? "mobile_money" : "bank_transfer"

  const payInEnabled = await isYcLocalPayInEnabledForCorridor(admin, {
    countryCode: country,
    currencyCode: currency,
    rail,
  })
  if (!payInEnabled) {
    return NextResponse.json({ error: "Local pay-in is not enabled for this corridor" }, { status: 403 })
  }

  const channels = await listYellowcardChannels()
  const channel = channels.find((ch) => {
    if (String(ch.country ?? "").toUpperCase() !== country) return false
    if (String(ch.currency ?? "").toUpperCase() !== currency) return false
    const ramp = String(ch.rampType ?? "").toLowerCase()
    if (ramp.includes("withdraw") || ramp.includes("send")) return false
    const t = String(ch.channelType ?? "").toLowerCase()
    return rail === "mobile_money" ? t.includes("momo") : t.includes("bank") || !t.includes("momo")
  })
  const channelId = String(channel?.id ?? channel?.channelId ?? "").trim()
  if (!channelId) {
    return NextResponse.json({ error: "No YC receive channel" }, { status: 400 })
  }

  let sender
  try {
    sender = buildYcKycPersonMetadata({
      profile: {
        residenceCountry: userRow?.residence_country ?? country,
        kycIdType: userRow?.kyc_id_type,
        kycIdNumber: userRow?.kyc_id_number,
        ngLocalIdType: userRow?.ng_local_id_type,
        ngLocalIdNumber: userRow?.ng_local_id_number,
        fullName: userRow?.full_name,
        phone: userRow?.phone,
        email: userRow?.email,
        dateOfBirth: userRow?.date_of_birth,
        addressStreet: userRow?.kyc_address_street,
        addressCity: userRow?.kyc_address_city,
        addressCountry: userRow?.kyc_address_country,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "KYC metadata failed" },
      { status: 400 },
    )
  }

  const provisional = computeYcFundBalancePricing({
    usdCredit: body?.usdCredit,
    localPayIn: body?.localPayIn,
    customerSellRate: Number(leg.easner_sell),
    ycSellRate: Number(leg.yc_sell),
    receiveLeg: { cryptoAmountUsd: 0 },
  })

  const sequenceId = `yc_fb_${randomUUID()}`
  const receiveRes = await submitYcReceive({
    sequenceId,
    customerUID: kycUserId,
    channelId,
    currency,
    country,
    localAmount: provisional.localPayIn,
    sender,
    reason: "fund_balance",
  })

  const pricing = computeYcFundBalancePricing({
    localPayIn: Number(receiveRes.localAmount ?? provisional.localPayIn),
    customerSellRate: Number(leg.easner_sell),
    ycSellRate: Number(leg.yc_sell),
    receiveLeg: {
      cryptoAmountUsd: Number(receiveRes.settlementInfo?.cryptoAmount ?? 0),
      networkFeeAmountUsd: Number(receiveRes.networkFeeAmountUSD ?? 0),
      serviceFeeAmountUsd: Number(receiveRes.serviceFeeAmountUSD ?? 0),
    },
  })

  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const businessId = noahCtx.scope === "business" ? noahCtx.businessId : null
  const metadata = buildYcFundBalanceReceiveMetadata({
    sequenceId,
    localPayIn: pricing.localPayIn,
    localCurrency: currency,
    usdCredit: pricing.usdCredit,
    processingFee: pricing.processingFee,
  })

  const { data: tx } = await admin
    .from("transactions")
    .insert({
      user_id: kycUserId,
      business_id: businessId,
      provider: "yellowcard",
      status: "pending",
      amount: pricing.usdCredit,
      currency: "USD",
      direction: "in",
      metadata,
    })
    .select("id")
    .single()

  await admin.from("yc_transfers").insert({
    transaction_id: tx?.id ?? null,
    user_id: kycUserId,
    business_id: businessId,
    mode: "fund_balance",
    status: "awaiting_pay_in",
    pay_in_currency: currency,
    receive_currency: "USD",
    quoted_pay_in: pricing.localPayIn,
    quoted_receive: pricing.usdCredit,
    customer_rate: Number(leg.easner_sell),
    leg1_sequence_id: sequenceId,
    leg1_yc_id: receiveRes.id ?? null,
    leg1_channel_id: channelId,
    bank_info: receiveRes.bankInfo ?? null,
    settlement_info: receiveRes.settlementInfo ?? null,
    metadata: { processing_fee: pricing.processingFee, usd_credit: pricing.usdCredit },
    expires_at: expiresAt,
  })

  return NextResponse.json({
    ok: true,
    sequenceId,
    localPayIn: pricing.localPayIn,
    usdCredit: pricing.usdCredit,
    customerRate: Number(leg.easner_sell),
    bankInfo: receiveRes.bankInfo ?? null,
    processingFee: pricing.processingFee,
    expiresAt,
    transactionId: tx?.id ?? null,
    payInNotice: `Complete your transfer using the payment details below.`,
  })
}
