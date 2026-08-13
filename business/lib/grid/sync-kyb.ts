import type { SupabaseClient } from "@supabase/supabase-js"
import { gridFetch, GridHttpError } from "./http"
import { normalizeGridCustomerId } from "./quote-request"
import type { GridCustomer } from "./types"
import {
  mapGridPartnerStatus,
  persistVerificationStatus,
  type VerificationStatus,
} from "@/lib/compliance"
import { notifyBusinessKybStatusChange } from "@/lib/notifications/verification-notify"
import { extractGridCustomerRejectionReasons } from "@easner/shared"
import { parseGridCustomerForBusiness } from "./parse-grid-customer-for-business"
import { syncGridBusinessOwnerUserFromKyb } from "./sync-grid-business-owner-user"

type KybEmailStatus = "not_started" | "under_review" | "approved" | "rejected"

function verificationStatusForKybEmail(status: VerificationStatus): KybEmailStatus {
  if (status === "approved") return "approved"
  if (status === "rejected") return "rejected"
  if (status === "pending" || status === "hold") return "under_review"
  return "not_started"
}

export async function fetchGridCustomer(customerId: string): Promise<GridCustomer & Record<string, unknown>> {
  return gridFetch<GridCustomer & Record<string, unknown>>({
    method: "GET",
    path: `/customers/${encodeURIComponent(normalizeGridCustomerId(customerId))}`,
  })
}

export function gridBusinessKybStatus(customer: Record<string, unknown>): VerificationStatus {
  const kyb = customer.kybStatus ?? customer.kycStatus
  return mapGridPartnerStatus(String(kyb ?? ""))
}

function shouldBackfillBusinessProfile(status: VerificationStatus): boolean {
  return status === "approved" || status === "pending" || status === "hold"
}

export async function syncGridBusinessKybToSupabase(input: {
  admin: SupabaseClient
  businessId: string
  userId: string
  customerId: string
  /** @deprecated Ignored — always fetches canonical customer from Grid API (webhook + poll parity). */
  customer?: Record<string, unknown>
  occurredAt?: string
}): Promise<{ status: VerificationStatus; customer: Record<string, unknown> }> {
  const customerId = normalizeGridCustomerId(input.customerId)
  const customer = await fetchGridCustomer(customerId).catch((e) => {
    if (e instanceof GridHttpError && e.status === 404) {
      throw new Error("Grid customer not found")
    }
    throw e
  })

  const status = gridBusinessKybStatus(customer)
  const gridStatusRaw = String(customer.kybStatus ?? customer.kycStatus ?? "").trim() || null
  const rejectionReasons =
    status === "rejected" || status === "hold"
      ? extractGridCustomerRejectionReasons(customer, gridStatusRaw)
      : null

  const verifiedAt = input.occurredAt ?? new Date().toISOString()

  const { data: priorBiz } = await input.admin
    .from("businesses")
    .select("verification_status")
    .eq("id", input.businessId)
    .maybeSingle()
  const previousStatus = verificationStatusForKybEmail(
    String(priorBiz?.verification_status ?? "not_started").toLowerCase() as VerificationStatus,
  )

  await persistVerificationStatus(input.admin, {
    kind: "business",
    businessId: input.businessId,
    userId: input.userId,
    provider: "grid",
    status,
    rejectionReasons,
    verifiedAt: status === "approved" ? verifiedAt : null,
    gridCustomerId: customerId,
  })

  const now = new Date().toISOString()
  if (shouldBackfillBusinessProfile(status)) {
    const kybFields = parseGridCustomerForBusiness(customer, {
      occurredAt: status === "approved" ? verifiedAt : undefined,
    })
    if (Object.keys(kybFields).length > 0) {
      await input.admin
        .from("businesses")
        .update({ ...kybFields, updated_at: now })
        .eq("id", input.businessId)
    }

    await syncGridBusinessOwnerUserFromKyb({
      admin: input.admin,
      businessId: input.businessId,
      fallbackUserId: input.userId,
      customer,
      occurredAt: status === "approved" ? verifiedAt : undefined,
    })
  }

  await notifyBusinessKybStatusChange(
    input.admin,
    input.businessId,
    previousStatus,
    verificationStatusForKybEmail(status),
    Array.isArray(rejectionReasons)
      ? rejectionReasons
          .map((r) => r.message ?? r.reason ?? r.publicComment)
          .filter((x): x is string => Boolean(x?.trim()))
      : null,
  ).catch((e) => console.warn("grid kyb verification email (non-fatal):", e))

  return { status, customer }
}
