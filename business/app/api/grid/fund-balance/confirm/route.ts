import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { requireAccountAllowsForUser } from "@/lib/account-restriction"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireGeoPersonalRailAccess } from "@/lib/compliance/geo-personal-rail-access"
import { firstGridPaymentInstructionWalletInfo } from "@/lib/grid/external-account"
import { createGridFundBalanceSession } from "@/lib/grid/fund-balance-session"
import {
  logGridFundBalanceConfirmError,
  mapGridFundBalanceConfirmError,
} from "@/lib/grid/fund-balance-errors"
import { normalizeYcMomoPhone } from "@easner/shared"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const admin = createSupabaseAdmin()
  const restricted = await requireAccountAllowsForUser(admin, user.id, "deposit")
  if (restricted instanceof NextResponse) return restricted

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const currency = String(body?.currency ?? "").trim().toUpperCase()
  const country = String(body?.country ?? "").trim().toUpperCase()
  if (!currency || !country) {
    return NextResponse.json({ error: "currency and country required" }, { status: 400 })
  }

  const rail = body?.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
  const sourcePhone =
    rail === "mobile_money"
      ? normalizeYcMomoPhone(String(body?.sourcePhone ?? "").trim(), country)
      : undefined
  const sourceNetworkId = rail === "mobile_money" ? String(body?.networkId ?? "").trim() : undefined
  const sourceNetworkName =
    rail === "mobile_money" ? String(body?.sourceNetworkName ?? "").trim() || undefined : undefined

  if (rail === "mobile_money" && (!sourcePhone || !sourceNetworkId)) {
    return NextResponse.json(
      { error: "Mobile money pay-in requires sourcePhone and networkId.", code: "momo_source_required" },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdmin()
  const businessId = noahCtxResult.scope === "business" ? noahCtxResult.businessId : null
  let kycUserId = user.id
  let userRow: Record<string, unknown> | null = null

  if (businessId) {
    const geo = await requireGeoPersonalRailAccess(request)
    if (!geo.ok) return geo.response
    kycUserId = geo.actorUserId
    userRow = geo.userRow
  } else {
    const { data } = await admin
      .from("users")
      .select(
        "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
      )
      .eq("id", kycUserId)
      .maybeSingle()
    userRow = data
  }

  try {
    const session = await createGridFundBalanceSession({
      admin,
      userId: kycUserId,
      businessId,
      country,
      currency,
      rail,
      usdCredit: body?.usdCredit != null && Number(body.usdCredit) > 0 ? Number(body.usdCredit) : undefined,
      localPayIn: body?.localPayIn != null && Number(body.localPayIn) > 0 ? Number(body.localPayIn) : undefined,
      sourcePhone,
      sourceNetworkId,
      sourceNetworkName,
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

    const bankInfo = firstGridPaymentInstructionWalletInfo(session.paymentInstructions)
    return NextResponse.json({
      ok: true,
      provider: "grid",
      quotePhase: "locked",
      transferId: session.transactionId,
      transactionId: session.easnerTransactionId,
      easnerTransactionId: session.easnerTransactionId,
      localPayIn: session.localPayIn,
      customerRate: session.customerRate,
      usdCredit: session.usdCredit,
      processingFee: session.processingFee,
      displayProcessingFee: session.displayProcessingFee,
      displayProcessingFeeLocal: session.displayProcessingFeeLocal,
      displayProcessingFeeCurrency: session.displayProcessingFeeCurrency,
      provisionalPayIn: session.provisionalPayIn,
      gridFees: session.gridFeesUsd ?? 0,
      bankInfo,
      expiresAt: session.expiresAt,
      payInRail: rail,
      sourcePhone,
      sourceNetworkId,
      sourceNetworkName,
    })
  } catch (e) {
    logGridFundBalanceConfirmError(e, { country, currency, rail, userId: kycUserId })
    const message = mapGridFundBalanceConfirmError(e)
    const status =
      e instanceof Error && e.message === "grid_corridor_disabled" ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
