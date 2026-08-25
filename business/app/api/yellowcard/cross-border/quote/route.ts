import { NextResponse, after } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { previewCrossBorderQuote } from "@/lib/yellowcard/cross-border-orchestrator"
import { expireStaleYcPayInTransfers } from "@/lib/yellowcard/quote-key"
import {
  ycPayInInstructionNotice,
  normalizeYcMomoPhone,
  parseYcReceiveRejectedMinError,
} from "@easner/shared"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import { depositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"
import {
  mapKycErrorToCode,
  ycFundBalanceQuoteError,
} from "@/lib/yellowcard/fund-balance-quote-errors"

export const runtime = "nodejs"

function crossBorderQuoteError(
  code: string,
  error: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  console.warn("[yc-cross-border-quote]", { code, error, ...extra })
  return NextResponse.json({ error, code, ...extra }, { status })
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response
  const noahCtx = noahCtxResult

  const admin = createSupabaseAdmin()
  const businessId = noahCtx.scope === "business" ? noahCtx.businessId : null
  const orgOwnerId =
    noahCtx.scope === "business" && noahCtx.businessId
      ? await resolveBusinessOrgOwnerUserId(admin, noahCtx.businessId).catch(() => null)
      : null
  const kycUserId = orgOwnerId ?? user.id
  // Maintenance job AFTER the response: this route is the interactive quote
  // the amount screen waits on; the expiry sweep (select + update + per-row
  // ledger writes) must not compete with it inside the request.
  after(() => expireStaleYcPayInTransfers(admin, { userId: kycUserId }).catch(() => {}))

  const body = (await request.json().catch(() => null)) as {
    recipientId?: string
    receiveAmount?: number
    payInCurrency?: string
    payInCountry?: string
    payInRail?: "bank_transfer" | "mobile_money"
    sourcePhone?: string
    networkId?: string
    sourceNetworkName?: string
  } | null

  const recipientId = body?.recipientId?.trim()
  const receiveAmount = Number(body?.receiveAmount)
  const payInCurrency = String(body?.payInCurrency ?? "").trim().toUpperCase()
  const payInCountry = String(body?.payInCountry ?? "").trim().toUpperCase()
  if (!recipientId || !(receiveAmount > 0) || !payInCurrency || !payInCountry) {
    return crossBorderQuoteError(
      "recipient_required",
      "recipientId, receiveAmount, payInCurrency, payInCountry required",
      400,
    )
  }

  if (!depositOmnibusSolanaAddressUsd()) {
    return ycFundBalanceQuoteError(
      "yc_settlement_wallet_not_configured",
      "deposit_omnibus_solana_address_usd_required",
      503,
      {
        hint: "Set DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD on the business API (USDC Solana omnibus for YC pay-in settlement).",
      },
    )
  }

  const { data: recipient } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", kycUserId)
    .maybeSingle()
  if (!recipient) {
    return crossBorderQuoteError("recipient_not_found", "Recipient not found", 404)
  }

  const { data: userRow } = await admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", kycUserId)
    .maybeSingle()

  const payInRail = body?.payInRail === "mobile_money" ? "mobile_money" : "bank_transfer"

  const corridorEnabled = await isYcLocalPayInEnabledForCorridor(admin, {
    countryCode: payInCountry,
    currencyCode: payInCurrency,
    rail: payInRail,
  })
  if (!corridorEnabled) {
    return ycFundBalanceQuoteError(
      "yc_corridor_disabled",
      "Local pay-in is not enabled for this corridor",
      400,
      { userId: kycUserId, currency: payInCurrency, country: payInCountry, rail: payInRail },
    )
  }

  if (payInRail === "mobile_money") {
    const sourcePhone = normalizeYcMomoPhone(String(body?.sourcePhone ?? "").trim(), payInCountry)
    const networkId = String(body?.networkId ?? "").trim()
    if (!sourcePhone || !networkId) {
      return ycFundBalanceQuoteError(
        "momo_source_required",
        "Mobile money cross-border requires sourcePhone and networkId",
        400,
        { userId: kycUserId, rail: payInRail },
      )
    }
  }

  try {
    const result = await previewCrossBorderQuote({
      admin,
      userId: kycUserId,
      businessId,
      customerUID: kycUserId,
      payInCurrency,
      payInCountry,
      payInRail,
      receiveAmount,
      recipient: recipient as RecipientSellPrepareRow,
      sourcePhone: payInRail === "mobile_money"
        ? normalizeYcMomoPhone(String(body?.sourcePhone ?? "").trim(), payInCountry)
        : body?.sourcePhone,
      sourceNetworkId: body?.networkId,
      sourceNetworkName: body?.sourceNetworkName,
      senderProfile: {
        residenceCountry: userRow?.residence_country ?? payInCountry,
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

    return NextResponse.json({
      ...result,
      payInNotice: ycPayInInstructionNotice(payInRail),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cross-border quote failed"
    if (message === "deposit_omnibus_solana_address_usd_required") {
      return ycFundBalanceQuoteError(
        "yc_settlement_wallet_not_configured",
        message,
        503,
        {
          hint: "Set DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD on the business API (USDC Solana omnibus for YC pay-in settlement).",
        },
      )
    }
    if (message === "yc_amount_below_min" || message.includes("below minimum")) {
      return ycFundBalanceQuoteError("yc_amount_below_min", message, 400, { userId: kycUserId })
    }
    if (message === "Local pay-in is not enabled for this corridor") {
      return ycFundBalanceQuoteError(
        "yc_corridor_disabled",
        message,
        400,
        { userId: kycUserId, currency: payInCurrency, country: payInCountry, rail: payInRail },
      )
    }
    const parsedMin = parseYcReceiveRejectedMinError(message)
    if (parsedMin) {
      return ycFundBalanceQuoteError("yc_amount_below_min", message, 400, {
        userId: kycUserId,
        minLocalPayIn: parsedMin.minLocalPayIn,
      })
    }
    if (
      message === "ng_local_verification_incomplete" ||
      message.includes("kyc") ||
      message.includes("KYC")
    ) {
      return ycFundBalanceQuoteError(mapKycErrorToCode(message), message, 400, { userId: kycUserId })
    }
    return crossBorderQuoteError("yc_cross_border_quote_failed", message, 400)
  }
}
