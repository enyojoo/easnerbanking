import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { normalizeYcMomoPhone } from "@easner/shared"
import {
  FundBalanceQuoteServiceError,
  confirmFundBalanceOrder,
  type FundBalanceRail,
} from "@/lib/yellowcard/fund-balance-quote-service"
import { ycFundBalanceQuoteError } from "@/lib/yellowcard/fund-balance-quote-errors"
import { expireStaleYcPayInTransfers } from "@/lib/yellowcard/quote-key"

export const runtime = "nodejs"

/** Lock YC receive + create ledger rows after user confirms review. */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const currency = String(body?.currency ?? "").trim().toUpperCase()
  const country = String(body?.country ?? "").trim().toUpperCase()
  if (!currency || !country) {
    return ycFundBalanceQuoteError(
      "currency_country_required",
      "currency and country required",
      400,
      { userId: user.id },
    )
  }

  const rail: FundBalanceRail = body?.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
  const sourcePhone =
    rail === "mobile_money"
      ? normalizeYcMomoPhone(String(body?.sourcePhone ?? "").trim(), country)
      : undefined
  const sourceNetworkId = rail === "mobile_money" ? String(body?.networkId ?? "").trim() : undefined
  const sourceNetworkName =
    rail === "mobile_money" ? String(body?.sourceNetworkName ?? "").trim() || undefined : undefined

  if (rail === "mobile_money" && (!sourcePhone || !sourceNetworkId)) {
    return ycFundBalanceQuoteError(
      "momo_source_required",
      "Mobile money pay-in requires sourcePhone and networkId.",
      400,
      { userId: user.id, rail },
    )
  }

  const admin = createSupabaseAdmin()
  const businessId = noahCtxResult.scope === "business" ? noahCtxResult.businessId : null
  const orgOwnerId =
    noahCtxResult.scope === "business" && noahCtxResult.businessId
      ? await resolveBusinessOrgOwnerUserId(admin, noahCtxResult.businessId).catch(() => null)
      : null
  const kycUserId = orgOwnerId ?? user.id
  void expireStaleYcPayInTransfers(admin, { userId: kycUserId }).catch(() => {})

  const { data: userRow } = await admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", kycUserId)
    .maybeSingle()

  try {
    const quote = await confirmFundBalanceOrder({
      admin,
      kycUserId,
      businessId,
      currency,
      country,
      rail,
      usdCredit:
        body?.usdCredit != null && Number(body.usdCredit) > 0 ? Number(body.usdCredit) : undefined,
      localPayIn:
        body?.localPayIn != null && Number(body.localPayIn) > 0 ? Number(body.localPayIn) : undefined,
      sourcePhone,
      sourceNetworkId,
      sourceNetworkName,
      userRow,
    })
    return NextResponse.json(quote)
  } catch (e) {
    if (e instanceof FundBalanceQuoteServiceError) {
      return ycFundBalanceQuoteError(e.code, e.message, e.status, e.extra)
    }
    const message = e instanceof Error ? e.message : "Fund balance confirm failed"
    return ycFundBalanceQuoteError("yc_confirm_failed", message, 400)
  }
}
