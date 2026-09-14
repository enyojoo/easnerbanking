import { canonicalizeHostedOnboardingReturnUrl } from "@/lib/auth/hosted-onboarding-complete"
import { getBridgeBusinessKybReturnUrl, getBridgeKycReturnUrl, getBridgeTosReturnUrl } from "./config"
import { bridgeFetch } from "./http"

export type BridgeCustomerType = "individual" | "business"

export type BridgeKycLink = {
  id: string
  full_name?: string
  email?: string
  type?: BridgeCustomerType
  kyc_link?: string | null
  tos_link?: string | null
  kyc_status?: string | null
  tos_status?: string | null
  customer_id?: string | null
  rejection_reasons?: unknown
  endorsements?: string[]
}

/** Bridge KYC links: individuals use the person; businesses must send the entity legal name. */
export function pickBridgeKycLinkFullName(input: {
  type: BridgeCustomerType
  businessLegalName?: string | null
  personFullName?: string | null
}): string {
  if (input.type === "business") {
    return String(input.businessLegalName ?? "").trim() || "Business"
  }
  return String(input.personFullName ?? "").trim() || "Customer"
}

export function bridgeCreateKycLinkIdempotencyKey(input: {
  type: BridgeCustomerType
  subjectId: string
  fullName: string
}): string {
  const name = String(input.fullName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
  // Individuals retry with a display-name fallback (email local-part). Keep the
  // key stable so Bridge does not treat reopen as a second customer.
  if (input.type === "individual") {
    return `bridge-kyc:${input.type}:${input.subjectId}`
  }
  return `bridge-kyc:${input.type}:${input.subjectId}:${name}`
}

function hostedUrlFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const rec = payload as Record<string, unknown>
  const url = String(rec.url ?? rec.kyc_link ?? rec.tos_link ?? "").trim()
  return url || null
}

/** POST /kyc_links does not put redirect_uri on tos_link. Accept would otherwise stay on Bridge. */
export function applyBridgeHostedRedirect(
  link: string | null | undefined,
  redirectUrl: string,
): string | null {
  const href = String(link ?? "").trim()
  if (!href) return null
  const redirect = canonicalizeHostedOnboardingReturnUrl(redirectUrl)
  if (!redirect) return href
  try {
    const url = new URL(href)
    if (!url.searchParams.has("redirect_uri")) {
      url.searchParams.set("redirect_uri", redirect)
    }
    return url.toString()
  } catch {
    return href
  }
}

export async function createBridgeKycLink(input: {
  fullName: string
  email: string
  type: BridgeCustomerType
  redirectUri?: string | null
  endorsements?: string[]
  idempotencyKey: string
}): Promise<BridgeKycLink> {
  const redirect = canonicalizeHostedOnboardingReturnUrl(
    input.redirectUri?.trim() ||
      (input.type === "business" ? getBridgeBusinessKybReturnUrl() : getBridgeKycReturnUrl()),
  )
  const created = await bridgeFetch<BridgeKycLink>({
    method: "POST",
    path: "/kyc_links",
    idempotencyKey: input.idempotencyKey,
    json: {
      full_name: input.fullName.trim(),
      email: input.email.trim(),
      type: input.type,
      endorsements: input.endorsements ?? ["base", "sepa"],
      ...(redirect ? { redirect_uri: redirect } : {}),
    },
  })
  return {
    ...created,
    tos_link: applyBridgeHostedRedirect(created.tos_link, getBridgeTosReturnUrl()),
  }
}

export async function getBridgeKycLink(kycLinkId: string): Promise<BridgeKycLink> {
  return bridgeFetch<BridgeKycLink>({
    method: "GET",
    path: `/kyc_links/${encodeURIComponent(kycLinkId)}`,
  })
}

function hostedRedirectQuery(redirectUrl: string): string {
  const redirect = canonicalizeHostedOnboardingReturnUrl(redirectUrl)
  return redirect ? `redirect_uri=${encodeURIComponent(redirect)}` : ""
}

export async function getBridgeCustomerKycLink(customerId: string): Promise<string | null> {
  const redirect = hostedRedirectQuery(getBridgeKycReturnUrl())
  const payload = await bridgeFetch<unknown>({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}/kyc_link?endorsement=sepa${redirect ? `&${redirect}` : ""}`,
  })
  return hostedUrlFromPayload(payload)
}

export async function attachBridgeSignedAgreement(input: {
  customerId: string
  signedAgreementId: string
}): Promise<void> {
  const signed = String(input.signedAgreementId ?? "").trim()
  if (!signed || signed.length > 1024) {
    throw new Error("signed_agreement_id is required")
  }
  await bridgeFetch({
    method: "PUT",
    path: `/customers/${encodeURIComponent(input.customerId)}`,
    idempotencyKey: `bridge-tos:${input.customerId}:${signed}`,
    json: { signed_agreement_id: signed },
  })
}

export async function getBridgeCustomerTosLink(customerId: string): Promise<string | null> {
  const redirect = hostedRedirectQuery(getBridgeTosReturnUrl())
  const payload = await bridgeFetch<unknown>({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}/tos_acceptance_link${redirect ? `?${redirect}` : ""}`,
  })
  return hostedUrlFromPayload(payload)
}

export async function getBridgeHostedLinksForCustomer(customerId: string): Promise<{
  kyc_link: string | null
  tos_link: string | null
}> {
  const [kyc, tos] = await Promise.all([
    getBridgeCustomerKycLink(customerId).catch(() => null),
    getBridgeCustomerTosLink(customerId).catch(() => null),
  ])
  return { kyc_link: kyc, tos_link: tos }
}

export type BridgeCustomerSummary = {
  id: string
  email?: string
  type?: BridgeCustomerType
  status?: string
  kyc_status?: string
  tos_status?: string
  endorsements?: Array<{ name?: string; status?: string }>
}

function asCustomerSummary(row: unknown): BridgeCustomerSummary | null {
  if (!row || typeof row !== "object") return null
  const rec = row as Record<string, unknown>
  const id = String(rec.id ?? rec.customer_id ?? "").trim()
  if (!id) return null
  const typeRaw = String(rec.type ?? "").trim().toLowerCase()
  const type: BridgeCustomerType | undefined =
    typeRaw === "business" || typeRaw === "individual" ? typeRaw : undefined
  const endorsements = Array.isArray(rec.endorsements)
    ? rec.endorsements
        .map((row) => {
          if (!row || typeof row !== "object") return null
          const e = row as { name?: unknown; status?: unknown }
          const name = String(e.name ?? "").trim()
          const status = String(e.status ?? "").trim()
          return name || status ? { name, status } : null
        })
        .filter((row): row is { name: string; status: string } => Boolean(row))
    : undefined
  return {
    id,
    email: String(rec.email ?? "").trim() || undefined,
    type,
    status: String(rec.status ?? "").trim() || undefined,
    kyc_status: String(rec.kyc_status ?? "").trim() || undefined,
    tos_status: String(rec.tos_status ?? "").trim() || undefined,
    endorsements,
  }
}

export function parseBridgeCustomerList(payload: unknown): BridgeCustomerSummary[] {
  if (Array.isArray(payload)) {
    return payload.map(asCustomerSummary).filter((row): row is BridgeCustomerSummary => Boolean(row))
  }
  if (!payload || typeof payload !== "object") return []
  const rec = payload as { data?: unknown; customers?: unknown }
  const rows = Array.isArray(rec.data) ? rec.data : Array.isArray(rec.customers) ? rec.customers : []
  return rows.map(asCustomerSummary).filter((row): row is BridgeCustomerSummary => Boolean(row))
}

export function pickBridgeCustomerForEmail(
  rows: BridgeCustomerSummary[],
  email: string,
  type: BridgeCustomerType,
): BridgeCustomerSummary | null {
  const wanted = email.trim().toLowerCase()
  if (!wanted) return null
  const matches = rows.filter((row) => {
    if (row.type && row.type !== type) return false
    const rowEmail = String(row.email ?? "").trim().toLowerCase()
    return !rowEmail || rowEmail === wanted
  })
  if (matches.length === 0) return null
  return (
    matches.find((row) => resolveBridgeCustomerKycStatus(row) === "approved") ??
    matches[0] ??
    null
  )
}

export async function findBridgeCustomerByEmail(
  email: string,
  type: BridgeCustomerType,
): Promise<BridgeCustomerSummary | null> {
  const trimmed = email.trim()
  if (!trimmed) return null
  const query = new URLSearchParams({ email: trimmed, limit: "20" })
  const payload = await bridgeFetch<unknown>({
    method: "GET",
    path: `/customers?${query.toString()}`,
  })
  const picked = pickBridgeCustomerForEmail(parseBridgeCustomerList(payload), trimmed, type)
  if (!picked?.id) return null
  const full = await getBridgeCustomer(picked.id).catch(() => null)
  return full ? { ...picked, ...asCustomerSummary(full) } : picked
}

export async function getBridgeCustomer(customerId: string): Promise<{
  id: string
  status?: string
  kyc_status?: string
  tos_status?: string
  type?: BridgeCustomerType
  endorsements?: Array<{ name?: string; status?: string }>
}> {
  return bridgeFetch({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}`,
  })
}

export function isBridgeTosApproved(customer: {
  tos_status?: string | null
}): boolean {
  return String(customer.tos_status ?? "").trim().toLowerCase() === "approved"
}

/** Prefer KYC/endorsement fields. Never treat platform `active` as in-progress KYC. */
export function resolveBridgeCustomerKycStatus(customer: {
  kyc_status?: string | null
  status?: string | null
  endorsements?: Array<{ name?: string; status?: string }> | null
}): ReturnType<typeof mapBridgeKycStatus> {
  const fromKyc = mapBridgeKycStatus(customer.kyc_status)
  if (fromKyc === "approved") return "approved"
  const endorsed = (customer.endorsements ?? []).some((row) => {
    const name = String(row.name ?? "").trim().toLowerCase()
    const status = String(row.status ?? "").trim().toLowerCase()
    return status === "approved" && (name === "base" || name === "sepa" || name === "cards")
  })
  if (endorsed) return "approved"
  if (String(customer.kyc_status ?? "").trim()) return fromKyc
  return "not_started"
}

export function hostedLinksForExistingCustomer(input: {
  customerId: string
  customer: {
    kyc_status?: string | null
    status?: string | null
    tos_status?: string | null
    endorsements?: Array<{ name?: string; status?: string }> | null
  } | null
  fallbackStatus?: string
  hosted: { kyc_link: string | null; tos_link: string | null }
}): {
  kyc_link: string | null
  tos_link: string | null
  kyc_status: string
  customer_id: string
  alreadyOnboarded: boolean
} {
  const mapped = resolveBridgeCustomerKycStatus(
    input.customer ?? { kyc_status: input.fallbackStatus ?? null },
  )
  const tosOk = isBridgeTosApproved(input.customer ?? {})
  if (mapped === "approved") {
    return {
      kyc_link: null,
      tos_link: null,
      kyc_status: "approved",
      customer_id: input.customerId,
      alreadyOnboarded: true,
    }
  }
  return {
    kyc_link: input.hosted.kyc_link,
    tos_link: tosOk ? null : input.hosted.tos_link,
    kyc_status: mapped,
    customer_id: input.customerId,
    alreadyOnboarded: false,
  }
}

export function mapBridgeKycStatus(raw: string | null | undefined):
  | "not_started"
  | "in_progress"
  | "pending"
  | "approved"
  | "rejected" {
  const s = String(raw ?? "").trim().toLowerCase()
  if (s === "approved") return "approved"
  if (s === "rejected" || s === "denied") return "rejected"
  if (s === "under_review" || s === "pending") return "pending"
  if (s === "incomplete" || s === "awaiting_questionnaire" || s === "not_started") {
    return s === "not_started" ? "not_started" : "in_progress"
  }
  if (!s) return "not_started"
  return "in_progress"
}
