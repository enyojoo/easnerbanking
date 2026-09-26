import { NextResponse } from "next/server"
import {
  encodeNgLocalIdPair,
  isValidNgLocalIdNumber,
  NG_LOCAL_ID_PAIR,
  normalizeNgLocalIdType,
  resolveNgLocalVerification,
} from "@easner/shared"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import {
  actorNgLocalEligible,
  requireGeoPersonalRailAccess,
} from "@/lib/compliance/geo-personal-rail-access"

export const runtime = "nodejs"

type Body = {
  /** Single missing ID (legacy Noah half: collect the other into ng_local_*). */
  ngLocalIdType?: string
  ngLocalIdNumber?: string
  /** Both IDs when kyc_id_* is empty (Bridge) — stored as PAIR. */
  nin?: string
  bvn?: string
}

/**
 * Save Nigeria local verification **supplement** on the signed-in user's row.
 *
 * Column map (never writes Bridge/Noah `kyc_id_*`):
 * - `kyc_id_type` / `kyc_id_number` — read-only legacy Noah (or empty under Bridge)
 * - `ng_local_id_type` / `ng_local_id_number` — Easner supplement:
 *   - one missing → type NIN|BVN + 11-digit number
 *   - both missing → type PAIR + `nin|bvn`
 *
 * YC at send time: `buildNgYcIdPair` merges both into idType/idNumber + additional*.
 *
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

  const admin = createSupabaseAdmin()
  const { data: actor } = await admin
    .from("users")
    .select(
      "id,easner_business_id,residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number",
    )
    .eq("id", auth.id)
    .maybeSingle()

  if (!actor) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const businessId = (actor.easner_business_id as string | null) ?? null
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

  const current = resolveNgLocalVerification({
    residenceCountry: actor.residence_country,
    kycIdType: actor.kyc_id_type,
    kycIdNumber: actor.kyc_id_number,
    ngLocalIdType: actor.ng_local_id_type,
    ngLocalIdNumber: actor.ng_local_id_number,
  })

  if (current.complete) {
    return NextResponse.json({
      ok: true,
      alreadyComplete: true,
      ngLocalIdType: actor.ng_local_id_type,
      ngLocalIdNumber: actor.ng_local_id_number,
      userId: auth.id,
      missingTypes: [] as const,
      complete: true,
    })
  }

  const pairSubmit = body.nin !== undefined || body.bvn !== undefined
  let idType: string
  let idNumber: string

  if (current.missingTypes.length >= 2) {
    // Bridge / empty kyc_id_*: need both IDs in supplement PAIR.
    if (!pairSubmit) {
      return NextResponse.json(
        { error: "Provide both NIN and BVN", missingTypes: current.missingTypes },
        { status: 400 },
      )
    }
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
    // Legacy Noah half: kyc_id_* has one ID; collect the other into ng_local_*.
    const needed = current.missingTypes[0]
    if (!needed) {
      return NextResponse.json({ error: "Nothing to collect" }, { status: 400 })
    }
    if (pairSubmit) {
      return NextResponse.json(
        {
          error: `Only ${needed} is still needed (the other ID is already on file)`,
          missingTypes: current.missingTypes,
        },
        { status: 400 },
      )
    }
    const singleType = normalizeNgLocalIdType(body.ngLocalIdType)
    const singleNumber = String(body.ngLocalIdNumber ?? "").trim()
    if (singleType !== needed) {
      return NextResponse.json(
        { error: `ngLocalIdType must be ${needed}`, missingTypes: current.missingTypes },
        { status: 400 },
      )
    }
    if (!isValidNgLocalIdNumber(singleNumber)) {
      return NextResponse.json({ error: "ID number must be 11 digits" }, { status: 400 })
    }
    idType = singleType
    idNumber = singleNumber
  }

  const { error } = await admin
    .from("users")
    .update({
      ng_local_id_type: idType,
      ng_local_id_number: idNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.id)

  if (error) {
    console.error("[ng-local-verification] update failed", error.message)
    return NextResponse.json({ error: "Failed to save verification" }, { status: 500 })
  }

  const after = resolveNgLocalVerification({
    residenceCountry: actor.residence_country,
    kycIdType: actor.kyc_id_type,
    kycIdNumber: actor.kyc_id_number,
    ngLocalIdType: idType,
    ngLocalIdNumber: idNumber,
  })

  return NextResponse.json({
    ok: true,
    ngLocalIdType: idType,
    ngLocalIdNumber: idNumber,
    userId: auth.id,
    missingTypes: after.missingTypes,
    complete: after.complete,
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

  const state = resolveNgLocalVerification({
    residenceCountry: row?.residence_country,
    kycIdType: row?.kyc_id_type,
    kycIdNumber: row?.kyc_id_number,
    ngLocalIdType: row?.ng_local_id_type,
    ngLocalIdNumber: row?.ng_local_id_number,
  })

  return NextResponse.json({
    residenceCountry: row?.residence_country ?? null,
    kycIdType: row?.kyc_id_type ?? null,
    kycIdNumber: row?.kyc_id_number ?? null,
    ngLocalIdType: row?.ng_local_id_type ?? null,
    ngLocalIdNumber: row?.ng_local_id_number ?? null,
    missingTypes: state.missingTypes,
    missingType: state.missingType,
    complete: state.complete,
  })
}
