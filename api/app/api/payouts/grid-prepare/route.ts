import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { getPayoutLockSession } from "@/lib/payout/payout-lock-session"
import { attachLiveGridQuoteToLockSession } from "@/lib/payout/confirm-grid-balance-payout"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { mapGridPayoutQuoteUserError } from "@/lib/grid/format-grid-api-error"

/** Background Grid POST /quotes so PIN can fund without blocking Continue. */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const [noahCtxResult, acc] = await Promise.all([
    resolveNoahContextAsync(user.id, request),
    resolveNoahAccountContext(request, user.id, undefined, "write"),
  ])
  if (!noahCtxResult.ok) return noahCtxResult.response
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as { lockId?: string } | null
  const lockId = String(body?.lockId || "").trim()
  if (!lockId) {
    return NextResponse.json({ ok: false, error: "lockId is required." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const businessId = noahCtxResult.scope === "business" ? noahCtxResult.businessId : null
  const operationUserId =
    (businessId
      ? await resolveBusinessOrgOwnerUserId(admin, businessId).catch(() => null)
      : null) ?? user.id

  const lockRow = await getPayoutLockSession(admin, { lockId, userId: operationUserId })
  if (!lockRow || lockRow.provider !== "grid") {
    return NextResponse.json({ ok: false, error: "Payout lock expired or invalid." }, { status: 400 })
  }
  const recipientId = String(lockRow.recipient_id || "").trim()
  if (!recipientId) {
    return NextResponse.json({ ok: false, error: "Recipient is required." }, { status: 400 })
  }
  const { data: rec } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!rec) {
    return NextResponse.json({ ok: false, error: "Recipient not found." }, { status: 404 })
  }

  const { data: userRow } = await admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", operationUserId)
    .maybeSingle()

  try {
    const quote = await attachLiveGridQuoteToLockSession({
      admin,
      userId: operationUserId,
      lockId,
      recipient: rec as RecipientSellPrepareRow,
      senderProfile: {
        residenceCountry: userRow?.residence_country,
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
    return NextResponse.json({ ok: true, quote })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: mapGridPayoutQuoteUserError(e) },
      { status: 400 },
    )
  }
}
