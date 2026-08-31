import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireGeoPersonalRailAccess } from "@/lib/compliance/geo-personal-rail-access"
import { normalizeYcMomoPhone } from "@easner/shared"
import { ycFundBalanceQuoteError } from "@/lib/yellowcard/fund-balance-quote-errors"
import { expireStaleYcPayInTransfers } from "@/lib/yellowcard/quote-key"
import type { FundBalanceRail } from "@/lib/yellowcard/fund-balance-quote-service"

export type FundBalanceRequestBody = {
  currency?: string
  country?: string
  rail?: string
  usdCredit?: number
  localPayIn?: number
  sourcePhone?: string
  networkId?: string
  sourceNetworkName?: string
}

function parseFundBalanceBody(body: Record<string, unknown> | null, country: string) {
  const currency = String(body?.currency ?? "").trim().toUpperCase()
  const rail: FundBalanceRail = body?.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
  const sourcePhone =
    rail === "mobile_money"
      ? normalizeYcMomoPhone(String(body?.sourcePhone ?? "").trim(), country)
      : undefined
  const sourceNetworkId = rail === "mobile_money" ? String(body?.networkId ?? "").trim() : undefined
  const sourceNetworkName =
    rail === "mobile_money" ? String(body?.sourceNetworkName ?? "").trim() || undefined : undefined

  return {
    currency,
    country,
    rail,
    usdCredit: body?.usdCredit != null && Number(body.usdCredit) > 0 ? Number(body.usdCredit) : undefined,
    localPayIn: body?.localPayIn != null && Number(body.localPayIn) > 0 ? Number(body.localPayIn) : undefined,
    sourcePhone,
    sourceNetworkId,
    sourceNetworkName,
  }
}

export async function resolveYcFundBalanceContext(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return { error: auth.error } as const
  const { user } = auth

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return { error: noahCtxResult.response } as const

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = parseFundBalanceBody(body, String(body?.country ?? "").trim().toUpperCase())
  if (!parsed.currency || !parsed.country) {
    return {
      error: ycFundBalanceQuoteError(
        "currency_country_required",
        "currency and country required",
        400,
        { userId: user.id },
      ),
    } as const
  }

  if (parsed.rail === "mobile_money" && (!parsed.sourcePhone || !parsed.sourceNetworkId)) {
    return {
      error: ycFundBalanceQuoteError(
        "momo_source_required",
        "Mobile money pay-in requires sourcePhone and networkId.",
        400,
        { userId: user.id, rail: parsed.rail },
      ),
    } as const
  }

  const businessId = noahCtxResult.scope === "business" ? noahCtxResult.businessId : null
  if (businessId) {
    const geo = await requireGeoPersonalRailAccess(request)
    if (!geo.ok) return { error: geo.response } as const

    void expireStaleYcPayInTransfers(createSupabaseAdmin(), { userId: geo.actorUserId }).catch(() => {})

    return {
      ctx: {
        admin: createSupabaseAdmin(),
        kycUserId: geo.actorUserId,
        businessId,
        userRow: geo.userRow,
        ...parsed,
      },
    } as const
  }

  const admin = createSupabaseAdmin()
  const kycUserId = user.id
  void expireStaleYcPayInTransfers(admin, { userId: kycUserId }).catch(() => {})

  const { data: userRow } = await admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", kycUserId)
    .maybeSingle()

  return {
    ctx: {
      admin,
      kycUserId,
      businessId: null,
      userRow,
      ...parsed,
    },
  } as const
}
