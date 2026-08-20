import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { normalizeYcMomoPhone } from "@easner/shared"
import {
  FundBalanceQuoteServiceError,
  previewFundBalanceQuote,
  type FundBalanceRail,
} from "@/lib/yellowcard/fund-balance-quote-service"
import { ycFundBalanceQuoteError } from "@/lib/yellowcard/fund-balance-quote-errors"
import { expireStaleYcPayInTransfers } from "@/lib/yellowcard/quote-key"

export const runtime = "nodejs"

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

async function resolveFundBalanceContext(request: Request) {
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

  return {
    ctx: {
      admin,
      kycUserId,
      businessId,
      userRow,
      ...parsed,
    },
  } as const
}

function mapServiceError(e: unknown) {
  if (e instanceof FundBalanceQuoteServiceError) {
    return ycFundBalanceQuoteError(e.code, e.message, e.status, e.extra)
  }
  const message = e instanceof Error ? e.message : "Fund balance quote failed"
  return ycFundBalanceQuoteError("yc_quote_failed", message, 400)
}

/** Indicative pricing – no YC API calls, no ledger rows. */
export async function POST(request: Request) {
  const resolved = await resolveFundBalanceContext(request)
  if ("error" in resolved) return resolved.error

  try {
    const quote = await previewFundBalanceQuote(resolved.ctx)
    return NextResponse.json(quote)
  } catch (e) {
    return mapServiceError(e)
  }
}
