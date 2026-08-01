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

export async function syncGridBusinessKybToSupabase(input: {
  admin: SupabaseClient
  businessId: string
  userId: string
  customerId: string
  customer?: Record<string, unknown>
  occurredAt?: string
}): Promise<{ status: VerificationStatus; customer: Record<string, unknown> }> {
  const customer =
    input.customer ??
    (await fetchGridCustomer(input.customerId).catch((e) => {
      if (e instanceof GridHttpError && e.status === 404) {
        throw new Error("Grid customer not found")
      }
      throw e
    }))

  const status = gridBusinessKybStatus(customer)
  const gridStatusRaw = String(customer.kybStatus ?? customer.kycStatus ?? "").trim() || null
  const rejectionReasons =
    status === "rejected" || status === "hold"
      ? extractGridCustomerRejectionReasons(customer, gridStatusRaw)
      : null

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
    gridCustomerId: normalizeGridCustomerId(input.customerId),
  })

  const now = new Date().toISOString()
  if (status === "approved") {
    const kybFields = parseGridCustomerForBusiness(customer, {
      occurredAt: input.occurredAt,
    })
    if (Object.keys(kybFields).length > 0) {
      await input.admin
        .from("businesses")
        .update({ ...kybFields, updated_at: now })
        .eq("id", input.businessId)
    }
  } else {
    await input.admin
      .from("businesses")
      .update({ kyb_verified_at: null, updated_at: now })
      .eq("id", input.businessId)
      .not("kyb_verified_at", "is", null)
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
