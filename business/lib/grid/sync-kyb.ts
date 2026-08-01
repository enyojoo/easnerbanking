import type { SupabaseClient } from "@supabase/supabase-js"
import { gridFetch, GridHttpError } from "./http"
import { normalizeGridCustomerId } from "./quote-request"
import type { GridCustomer } from "./types"
import {
  mapGridPartnerStatus,
  persistVerificationStatus,
  type VerificationStatus,
} from "@/lib/compliance"

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
  const rejectionReasons =
    status === "rejected" || status === "hold"
      ? {
          gridStatus: customer.kybStatus ?? customer.kycStatus ?? null,
          raw: customer,
        }
      : null

  await persistVerificationStatus(input.admin, {
    kind: "business",
    businessId: input.businessId,
    userId: input.userId,
    provider: "grid",
    status,
    rejectionReasons,
    gridCustomerId: normalizeGridCustomerId(input.customerId),
  })

  return { status, customer }
}
