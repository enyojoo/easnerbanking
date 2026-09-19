import { NextResponse } from "next/server"
import {
  encodeNgLocalIdPair,
  isValidNgLocalIdNumber,
  NG_LOCAL_ID_PAIR,
  normalizeNgLocalIdType,
} from "@easner/shared"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import {
  actorNgLocalEligible,
  requireGeoPersonalRailAccess,
} from "@/lib/compliance/geo-personal-rail-access"

export const runtime = "nodejs"

type Body = {
  /** Single missing ID (one-field form). */
  ngLocalIdType?: string
  ngLocalIdNumber?: string
  /** Both IDs when neither is on file. */
  nin?: string
  bvn?: string
}

/**
 * Save Nigeria local verification supplement on the signed-in user's row.
 * Business sessions: Owner/Admin only; actor must be NG-resident.
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

  const pairSubmit = body.nin !== undefined || body.bvn !== undefined
  let idType: string
  let idNumber: string

  if (pairSubmit) {
    const nin = String(body.nin ?? "").trim()
    const bvn = String(body.bvn ?? "").trim()
    if (!nin || !bvn) {
      return NextResponse.json({ error: "Provide both NIN and BVN" }, { status: 400 })
    }
    if (!isValidNgLocalIdNumber(nin) || !isValidNgLocalIdNumber(bvn)) {
      return NextResponse.json({ error: "NIN and BVN must each be 11 digits" }, { status: 400 })
    }
    idType = NG_LOCAL_ID_PAIR
    idNumber = encodeNgLocalIdPair(nin, bvn)
  } else {
    const singleType = normalizeNgLocalIdType(body.ngLocalIdType)
    const singleNumber = String(body.ngLocalIdNumber ?? "").trim()
    if (!singleType) {
      return NextResponse.json({ error: "ngLocalIdType must be NIN or BVN" }, { status: 400 })
    }
    if (!isValidNgLocalIdNumber(singleNumber)) {
      return NextResponse.json({ error: "ID number must be 11 digits" }, { status: 400 })
    }
    idType = singleType
    idNumber = singleNumber
  }

  const admin = createSupabaseAdmin()
  const { data: actor } = await admin
    .from("users")
    .select("id,easner_business_id,residence_country")
    .eq("id", auth.id)
    .maybeSingle()

  const businessId = (actor?.easner_business_id as string | null) ?? null
  if (businessId) {
    const geo = await requireGeoPersonalRailAccess(request)
    if (!geo.ok) return geo.response
    if (!actorNgLocalEligible(geo.userRow)) {
      return NextResponse.json(
        { error: "Nigeria local verification is only available for Nigeria-based team members." },
        { status: 403 },
      )
    }
  } else if (!actorNgLocalEligible(actor)) {
    return NextResponse.json(
      { error: "Nigeria local verification is only available for Nigeria residents." },
      { status: 403 },
    )
  }

  const targetUserId = auth.id
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
  const { data: row } = await admin
    .from("users")
    .select(
      "id,easner_business_id,residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number",
    )
    .eq("id", auth.id)
    .maybeSingle()

  return NextResponse.json({
    residenceCountry: row?.residence_country ?? null,
    kycIdType: row?.kyc_id_type ?? null,
    kycIdNumber: row?.kyc_id_number ?? null,
    ngLocalIdType: row?.ng_local_id_type ?? null,
    ngLocalIdNumber: row?.ng_local_id_number ?? null,
  })
}
