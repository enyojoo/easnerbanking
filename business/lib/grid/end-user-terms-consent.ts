import type { SupabaseClient } from "@supabase/supabase-js"
import type { User } from "@supabase/supabase-js"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { gridFetch } from "./http"

/** Grid API acceptanceMethod enum – Easner Terms CTA is click-to-accept. */
export type GridAcceptanceMethod = "CHECKBOX" | "CLICK_TO_ACCEPT"

/** Local audit trail method (stored on users.grid_end_user_terms_accept_method). */
export type LocalAcceptanceMethod =
  | "signup_email"
  | "login_email"
  | "signup_apple"
  | "login_apple"
  | "signup_google"
  | "login_google"
  | "signup_oauth"
  | "login_oauth"

export type GridEndUserTermsConsentPayload = {
  acceptanceMethod: GridAcceptanceMethod
  acceptedAt: string
  ipAddress: string
  termsVersion: string
}

export type GridEndUserTermsUserRow = {
  id?: string | null
  grid_end_user_terms_version?: string | null
  grid_end_user_terms_accepted_at?: string | null
  grid_end_user_terms_accept_ip?: string | null
  grid_end_user_terms_accept_method?: string | null
  grid_end_user_terms_synced_at?: string | null
}

const TERMS_USER_COLUMNS =
  "id,grid_end_user_terms_version,grid_end_user_terms_accepted_at,grid_end_user_terms_accept_ip,grid_end_user_terms_accept_method,grid_end_user_terms_synced_at"

type CachedTerms = { version: string; url: string; fetchedAt: number }
let termsCache: CachedTerms | null = null
const TERMS_CACHE_TTL_MS = 60 * 60 * 1000

export async function fetchCurrentEndUserTermsVersion(opts?: {
  forceRefresh?: boolean
}): Promise<{ version: string; url: string }> {
  const now = Date.now()
  if (
    !opts?.forceRefresh &&
    termsCache &&
    now - termsCache.fetchedAt < TERMS_CACHE_TTL_MS &&
    termsCache.version
  ) {
    return { version: termsCache.version, url: termsCache.url }
  }

  const res = await gridFetch<{ version?: string; url?: string }>({
    method: "GET",
    path: "/customers/end-user-terms",
  })
  const version = String(res.version ?? "").trim()
  const url = String(res.url ?? "").trim()
  if (!version) {
    throw new Error("Grid end-user-terms response missing version")
  }
  termsCache = { version, url, fetchedAt: now }
  return { version, url }
}

/** Test helper – clear in-memory terms cache. */
export function clearEndUserTermsCacheForTests(): void {
  termsCache = null
}

export function resolveClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first.slice(0, 128)
  }
  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp.slice(0, 128)
  return "0.0.0.0"
}

function identityProvider(identities: User["identities"] | undefined): string {
  const provider = String(identities?.[0]?.provider ?? "email")
    .trim()
    .toLowerCase()
  return provider || "email"
}

export function inferAcceptanceMethod(
  isNewUser: boolean,
  identities: User["identities"] | undefined,
): LocalAcceptanceMethod {
  const provider = identityProvider(identities)
  const phase = isNewUser ? "signup" : "login"
  if (provider === "apple") return `${phase}_apple`
  if (provider === "google") return `${phase}_google`
  if (provider === "email") return `${phase}_email`
  return `${phase}_oauth`
}

export function shouldRefreshGridTermsAcceptance(
  userRow: GridEndUserTermsUserRow | null | undefined,
  currentVersion: string,
): boolean {
  const version = String(currentVersion ?? "").trim()
  if (!version) return false
  if (!userRow?.id) return true
  const acceptedVersion = String(userRow.grid_end_user_terms_version ?? "").trim()
  if (!acceptedVersion) return true
  if (acceptedVersion !== version) return true
  if (!String(userRow.grid_end_user_terms_accepted_at ?? "").trim()) return true
  return false
}

export async function recordGridEndUserTermsAcceptance(
  admin: SupabaseClient,
  input: {
    userId: string
    ip: string
    method: LocalAcceptanceMethod | string
    version?: string
  },
): Promise<{ version: string; acceptedAt: string }> {
  const version =
    input.version?.trim() || (await fetchCurrentEndUserTermsVersion()).version
  const acceptedAt = new Date().toISOString()
  const ip = String(input.ip ?? "").trim().slice(0, 128) || "0.0.0.0"
  const method = String(input.method ?? "login_email").trim().slice(0, 64) || "login_email"

  const { error } = await admin
    .from("users")
    .update({
      grid_end_user_terms_version: version,
      grid_end_user_terms_accepted_at: acceptedAt,
      grid_end_user_terms_accept_ip: ip,
      grid_end_user_terms_accept_method: method,
      updated_at: acceptedAt,
    })
    .eq("id", input.userId)

  if (error) throw error
  return { version, acceptedAt }
}

export function buildEndUserTermsConsentPayload(
  userRow: GridEndUserTermsUserRow | null | undefined,
): GridEndUserTermsConsentPayload | null {
  const termsVersion = String(userRow?.grid_end_user_terms_version ?? "").trim()
  const acceptedAt = String(userRow?.grid_end_user_terms_accepted_at ?? "").trim()
  const ipAddress = String(userRow?.grid_end_user_terms_accept_ip ?? "").trim()
  if (!termsVersion || !acceptedAt || !ipAddress) return null

  return {
    acceptanceMethod: "CLICK_TO_ACCEPT",
    acceptedAt,
    ipAddress,
    termsVersion,
  }
}

export async function loadGridEndUserTermsConsentForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<GridEndUserTermsConsentPayload | null> {
  const { data } = await admin
    .from("users")
    .select(TERMS_USER_COLUMNS)
    .eq("id", userId)
    .maybeSingle()
  return buildEndUserTermsConsentPayload(data as GridEndUserTermsUserRow | null)
}

export async function loadGridEndUserTermsConsentForBusiness(
  admin: SupabaseClient,
  businessId: string,
  fallbackUserId: string,
): Promise<{ consent: GridEndUserTermsConsentPayload | null; ownerUserId: string }> {
  const ownerUserId = await resolveOrgOwnerUserId(admin, businessId, fallbackUserId)
  const consent = await loadGridEndUserTermsConsentForUser(admin, ownerUserId)
  return { consent, ownerUserId }
}

export async function markGridEndUserTermsSynced(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  await admin
    .from("users")
    .update({
      grid_end_user_terms_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
}

function readTermsObject(customer: Record<string, unknown>): Record<string, unknown> | null {
  const terms = customer.endUserTermsConsent ?? customer.end_user_terms_consent
  return terms && typeof terms === "object" ? (terms as Record<string, unknown>) : null
}

/** Mirror Grid BUSINESS customer endUserTermsConsent → owner `users` audit columns. */
export function parseGridEndUserTermsFromGridCustomer(
  customer: Record<string, unknown>,
): Partial<GridEndUserTermsUserRow> {
  const terms = readTermsObject(customer)
  if (!terms) return {}

  const version = String(terms.termsVersion ?? terms.terms_version ?? "").trim()
  const acceptedAt = String(terms.acceptedAt ?? terms.accepted_at ?? "").trim()
  const ipAddress = String(terms.ipAddress ?? terms.ip_address ?? "").trim()
  const acceptanceMethod = String(terms.acceptanceMethod ?? terms.acceptance_method ?? "").trim()

  const out: Partial<GridEndUserTermsUserRow> = {}
  if (version) out.grid_end_user_terms_version = version
  if (acceptedAt) out.grid_end_user_terms_accepted_at = acceptedAt
  if (ipAddress) out.grid_end_user_terms_accept_ip = ipAddress.slice(0, 128)
  if (acceptanceMethod) {
    out.grid_end_user_terms_accept_method = `grid_${acceptanceMethod.toLowerCase()}`
  }
  out.grid_end_user_terms_synced_at = new Date().toISOString()
  return out
}

/**
 * Returns true when the Grid customer needs endUserTermsConsent PATCHed
 * (missing or stale vs our stored audit version).
 */
export function customerNeedsEndUserTermsConsentPatch(
  customer: { endUserTermsConsent?: { termsVersion?: string } | null } | null | undefined,
  consent: GridEndUserTermsConsentPayload,
): boolean {
  const onCustomer = String(customer?.endUserTermsConsent?.termsVersion ?? "").trim()
  if (!onCustomer) return true
  return onCustomer !== consent.termsVersion
}
