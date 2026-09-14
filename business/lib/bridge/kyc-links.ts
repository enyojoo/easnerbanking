import { canonicalizeHostedOnboardingReturnUrl } from "@/lib/auth/hosted-onboarding-complete"
import { getBridgeBusinessKybReturnUrl, getBridgeKycReturnUrl } from "./config"
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
  return bridgeFetch<BridgeKycLink>({
    method: "POST",
    path: "/kyc_links",
    idempotencyKey: input.idempotencyKey,
    json: {
      full_name: input.fullName.trim(),
      email: input.email.trim(),
      type: input.type,
      endorsements: input.endorsements ?? ["sepa"],
      ...(redirect ? { redirect_uri: redirect } : {}),
    },
  })
}

export async function getBridgeKycLink(kycLinkId: string): Promise<BridgeKycLink> {
  return bridgeFetch<BridgeKycLink>({
    method: "GET",
    path: `/kyc_links/${encodeURIComponent(kycLinkId)}`,
  })
}

export async function getBridgeCustomer(customerId: string): Promise<{
  id: string
  status?: string
  kyc_status?: string
  type?: BridgeCustomerType
  endorsements?: Array<{ name?: string; status?: string }>
}> {
  return bridgeFetch({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}`,
  })
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
