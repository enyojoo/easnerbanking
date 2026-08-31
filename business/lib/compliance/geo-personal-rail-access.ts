import { NextResponse } from "next/server"
import { expressDepositsPayerCountry } from "@easner/shared"
import { requireBusinessOrgWithRole, type BusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { isExpressDepositsPayerEligible } from "@/lib/stripe/onramp-gate"

export const GEO_PERSONAL_RAIL_USER_COLUMNS =
  "id,email,full_name,phone,date_of_birth,residence_country,kyc_id_type,kyc_id_number,kyc_id_issuing_country,kyc_address_street,kyc_address_city,kyc_address_state,kyc_address_post_code,kyc_address_country,ng_local_id_type,ng_local_id_number,stripe_crypto_customer_id,stripe_express_deposits_status,stripe_express_kyc_tier,stripe_express_payment_token_id,stripe_express_payment_methods,stripe_link_oauth_token_ciphertext"

export type GeoPersonalRailUserRow = {
  id: string
  email?: string | null
  full_name?: string | null
  phone?: string | null
  date_of_birth?: string | null
  residence_country?: string | null
  kyc_id_type?: string | null
  kyc_id_number?: string | null
  kyc_id_issuing_country?: string | null
  kyc_address_street?: string | null
  kyc_address_city?: string | null
  kyc_address_state?: string | null
  kyc_address_post_code?: string | null
  kyc_address_country?: string | null
  ng_local_id_type?: string | null
  ng_local_id_number?: string | null
  stripe_crypto_customer_id?: string | null
  stripe_express_deposits_status?: string | null
  stripe_express_kyc_tier?: string | null
  stripe_express_payment_token_id?: string | null
  stripe_express_payment_methods?: unknown
  stripe_link_oauth_token_ciphertext?: string | null
}

export type GeoPersonalRailAccess =
  | {
      ok: true
      actorUserId: string
      businessId: string
      role: BusinessRole
      userRow: GeoPersonalRailUserRow
      residenceCountry: string | null
    }
  | { ok: false; response: NextResponse }

export function canUseGeoPersonalRails(role: BusinessRole): boolean {
  return role === "Owner" || role === "Admin"
}

export function actorResidenceCountry(userRow: GeoPersonalRailUserRow | null | undefined): string | null {
  const code = String(userRow?.residence_country ?? "").trim().toUpperCase()
  return code || null
}

export function actorNgLocalEligible(userRow: GeoPersonalRailUserRow | null | undefined): boolean {
  return actorResidenceCountry(userRow) === "NG"
}

export function actorExpressDepositsEligible(userRow: GeoPersonalRailUserRow | null | undefined): boolean {
  const country = expressDepositsPayerCountry({
    residenceCountry: userRow?.residence_country,
    kycAddressCountry: userRow?.kyc_address_country,
  })
  return isExpressDepositsPayerEligible({
    country,
    state: userRow?.kyc_address_state,
  })
}

export async function requireGeoPersonalRailAccess(request: Request): Promise<GeoPersonalRailAccess> {
  const orgCtx = await requireBusinessOrgWithRole(request)
  if (!orgCtx.ok) return orgCtx

  if (!canUseGeoPersonalRails(orgCtx.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have permission to perform this action.", code: "ROLE_DENIED" },
        { status: 403 },
      ),
    }
  }

  const admin = createSupabaseAdmin()
  const { data: userRow, error } = await admin
    .from("users")
    .select(GEO_PERSONAL_RAIL_USER_COLUMNS)
    .eq("id", orgCtx.userId)
    .maybeSingle()

  if (error) {
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  if (!userRow) {
    return { ok: false, response: NextResponse.json({ error: "User not found" }, { status: 404 }) }
  }

  return {
    ok: true,
    actorUserId: orgCtx.userId,
    businessId: orgCtx.businessId,
    role: orgCtx.role,
    userRow: userRow as GeoPersonalRailUserRow,
    residenceCountry: actorResidenceCountry(userRow as GeoPersonalRailUserRow),
  }
}

/** Individual sessions without a business org still need actor-scoped geo rails. */
export async function loadIndividualGeoPersonalRailUser(
  request: Request,
): Promise<
  | { ok: true; actorUserId: string; businessId: null; userRow: GeoPersonalRailUserRow; residenceCountry: string | null }
  | { ok: false; response: NextResponse }
> {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const admin = createSupabaseAdmin()
  const { data: userRow, error } = await admin
    .from("users")
    .select(GEO_PERSONAL_RAIL_USER_COLUMNS)
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  if (!userRow) {
    return { ok: false, response: NextResponse.json({ error: "User not found" }, { status: 404 }) }
  }

  return {
    ok: true,
    actorUserId: user.id,
    businessId: null,
    userRow: userRow as GeoPersonalRailUserRow,
    residenceCountry: actorResidenceCountry(userRow as GeoPersonalRailUserRow),
  }
}

/** Pay-in flows use the actor's personal KYC; outbound org payouts may still use the owner elsewhere. */
export async function resolvePayInActorKycUserId(
  request: Request,
  businessId: string | null,
  sessionUserId: string,
): Promise<{ ok: true; kycUserId: string } | { ok: false; response: NextResponse }> {
  if (!businessId) return { ok: true, kycUserId: sessionUserId }
  const geo = await requireGeoPersonalRailAccess(request)
  if (!geo.ok) return geo
  return { ok: true, kycUserId: geo.actorUserId }
}
