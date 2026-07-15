import { NextResponse } from "next/server"
import { isValidNgLocalIdNumber, normalizeNgLocalIdType } from "@easner/shared"
import { resolveIsOrgOwnerForUser, resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

export const runtime = "nodejs"

type Body = {
  ngLocalIdType?: string
  ngLocalIdNumber?: string
}

/**
 * Save Nigeria local verification supplement on the subject users row.
 * Business sessions write to the org owner users row (owner/admin only).
 */
export async function PATCH(request: Request) {
  const auth = await getUserFromApiRequest(request)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const idType = normalizeNgLocalIdType(body.ngLocalIdType)
  const idNumber = String(body.ngLocalIdNumber ?? "").trim()
  if (!idType) {
    return NextResponse.json({ error: "ngLocalIdType must be NIN or BVN" }, { status: 400 })
  }
  if (!isValidNgLocalIdNumber(idNumber)) {
    return NextResponse.json({ error: "ID number must be 11 digits" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: actor } = await admin
    .from("users")
    .select("id,easner_business_id")
    .eq("id", auth.id)
    .maybeSingle()

  let targetUserId = auth.id
  const businessId = (actor?.easner_business_id as string | null) ?? null
  if (businessId) {
    const isOwner = await resolveIsOrgOwnerForUser(admin, auth.id, businessId)
    if (!isOwner) {
      return NextResponse.json({ error: "Only the organization owner can update local verification" }, { status: 403 })
    }
    const ownerId = await resolveOrgOwnerUserId(admin, businessId, auth.id)
    if (ownerId) targetUserId = ownerId
  }

  const { error } = await admin
    .from("users")
    .update({
      ng_local_id_type: idType,
      ng_local_id_number: idNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetUserId)

  if (error) {
    console.error("[ng-local-verification] update failed", error.message)
    return NextResponse.json({ error: "Failed to save verification" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    ngLocalIdType: idType,
    ngLocalIdNumber: idNumber,
    userId: targetUserId,
  })
}

export async function GET(request: Request) {
  const auth = await getUserFromApiRequest(request)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const { data: actor } = await admin
    .from("users")
    .select(
      "id,easner_business_id,residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number",
    )
    .eq("id", auth.id)
    .maybeSingle()

  let row = actor
  const businessId = (actor?.easner_business_id as string | null) ?? null
  if (businessId) {
    const ownerId = await resolveOrgOwnerUserId(admin, businessId, auth.id)
    if (ownerId && ownerId !== auth.id) {
      const { data: owner } = await admin
        .from("users")
        .select(
          "id,easner_business_id,residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number",
        )
        .eq("id", ownerId)
        .maybeSingle()
      if (owner) row = owner
    }
  }

  return NextResponse.json({
    residenceCountry: row?.residence_country ?? null,
    kycIdType: row?.kyc_id_type ?? null,
    kycIdNumber: row?.kyc_id_number ?? null,
    ngLocalIdType: row?.ng_local_id_type ?? null,
    ngLocalIdNumber: row?.ng_local_id_number ?? null,
  })
}
