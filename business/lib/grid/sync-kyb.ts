import type { SupabaseClient } from "@supabase/supabase-js"
import { gridFetch, gridFetchAllPages, GridHttpError } from "./http"
import { normalizeGridCustomerId } from "./quote-request"
import type { GridCustomer } from "./types"
import {
  persistVerificationStatus,
  type VerificationStatus,
} from "@/lib/compliance"
import { persistKybApplicationFromGrid } from "./kyb-application-store"
import { notifyBusinessKybStatusChange } from "@/lib/notifications/verification-notify"
import { extractGridCustomerRejectionReasons } from "@easner/shared"
import { isGridShellBusinessTaxId } from "./business-kyc-metadata"
import { parseGridCustomerForBusiness } from "./parse-grid-customer-for-business"
import { syncGridBusinessOwnerUserFromKyb } from "./sync-grid-business-owner-user"
import {
  gridVerificationsMissingIdentityDocument,
  resolveGridBusinessKybLocalStatus,
  type GridDocumentSummary,
  type GridVerificationSummary,
} from "./resolve-grid-business-kyb-status"

type KybEmailStatus = "not_started" | "under_review" | "approved" | "rejected" | "action_needed"

function verificationStatusForKybEmail(status: VerificationStatus): KybEmailStatus {
  if (status === "approved") return "approved"
  if (status === "rejected") return "rejected"
  if (status === "hold") return "action_needed"
  if (status === "pending") return "under_review"
  return "not_started"
}

function mergeGridKybRejectionReasons(
  customer: Record<string, unknown>,
  verifications: GridVerificationSummary[],
  gridStatusRaw: string | null,
  localStatus: VerificationStatus,
): ReturnType<typeof extractGridCustomerRejectionReasons> {
  const fromCustomer = extractGridCustomerRejectionReasons(customer, gridStatusRaw)
  const verificationErrors = verifications.flatMap((row) =>
    Array.isArray(row.errors) ? row.errors : [],
  )
  const fromVerifications = extractGridCustomerRejectionReasons(
    { errors: verificationErrors },
    null,
  )
  const merged = [...fromCustomer]
  for (const row of fromVerifications) {
    const message = String(row.message ?? row.reason ?? row.publicComment ?? "").trim()
    if (!message) continue
    if (merged.some((existing) => String(existing.message ?? existing.reason ?? existing.publicComment ?? "").trim() === message)) {
      continue
    }
    merged.push(row)
  }
  if (merged.length > 0) return merged
  if (localStatus === "hold") return extractGridCustomerRejectionReasons({}, "HOLD")
  return fromCustomer
}

export async function fetchGridCustomer(customerId: string): Promise<GridCustomer & Record<string, unknown>> {
  return gridFetch<GridCustomer & Record<string, unknown>>({
    method: "GET",
    path: `/customers/${encodeURIComponent(normalizeGridCustomerId(customerId))}`,
  })
}

export async function fetchGridVerificationsForCustomer(
  customerId: string,
): Promise<GridVerificationSummary[]> {
  const response = await gridFetch<{ data?: GridVerificationSummary[] }>({
    method: "GET",
    path: `/verifications?customerId=${encodeURIComponent(normalizeGridCustomerId(customerId))}&limit=20`,
  }).catch(() => ({ data: [] as GridVerificationSummary[] }))
  return Array.isArray(response.data) ? response.data : []
}

function normalizeDocumentHolderId(id: string): string {
  const trimmed = id.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith("Customer:") || trimmed.startsWith("BeneficialOwner:")) return trimmed
  return trimmed
}

function documentHolderIds(customerId: string, customer: Record<string, unknown>): string[] {
  const owners = Array.isArray(customer.beneficialOwners) ? customer.beneficialOwners : []
  const ownerIds = owners
    .map((row) => normalizeDocumentHolderId(String((row as { id?: unknown }).id ?? "")))
    .filter(Boolean)
  return [...new Set([customerId, ...ownerIds])]
}

export async function fetchGridDocumentsForKyb(
  customerId: string,
  customer: Record<string, unknown>,
): Promise<GridDocumentSummary[]> {
  const holders = documentHolderIds(normalizeGridCustomerId(customerId), customer)
  const pages = await Promise.all(
    holders.map((holder) =>
      gridFetchAllPages<GridDocumentSummary>({
        path: "/documents",
        query: { documentHolder: holder, limit: 50 },
        mapPage: (page) => (Array.isArray(page.data) ? page.data : []),
      }).catch(() => [] as GridDocumentSummary[]),
    ),
  )
  return pages.flat()
}

export function gridBusinessKybStatus(
  customer: Record<string, unknown>,
  verifications?: GridVerificationSummary[],
  documents?: GridDocumentSummary[],
): VerificationStatus {
  return resolveGridBusinessKybLocalStatus({ customer, verifications, documents })
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

  const verifications = await fetchGridVerificationsForCustomer(customerId)
  const documents = await fetchGridDocumentsForKyb(customerId, customer)
  let status = gridBusinessKybStatus(customer, verifications, documents)
  const gridStatusRaw = String(customer.kybStatus ?? customer.kycStatus ?? "").trim() || null
  const rejectionReasons =
    status === "rejected" || status === "hold"
      ? mergeGridKybRejectionReasons(customer, verifications, gridStatusRaw, status)
      : null

  const verifiedAt = input.occurredAt ?? new Date().toISOString()

  const { data: priorBiz } = await input.admin
    .from("businesses")
    .select("verification_status,tax_id")
    .eq("id", input.businessId)
    .maybeSingle()
  const priorLocal = String(priorBiz?.verification_status ?? "not_started").toLowerCase()
  // Keep in-review across empty Grid document lists, but not when Grid still
  // reports MISSING_IDENTITY_DOCUMENT (owner needs ID — CTA must come back).
  if (
    priorLocal === "pending" &&
    status === "in_progress" &&
    !gridVerificationsMissingIdentityDocument(verifications)
  ) {
    status = "pending"
  }
  const previousStatus = verificationStatusForKybEmail(priorLocal as VerificationStatus)

  const latestVerification = verifications[0]
  await persistKybApplicationFromGrid({
    admin: input.admin,
    businessId: input.businessId,
    gridCustomerId: customerId,
    verificationStatus: latestVerification?.verificationStatus,
    localStatus: status,
    verificationId: latestVerification?.id ? String(latestVerification.id) : null,
    errors: latestVerification?.errors ?? [],
  }).catch((e) => console.warn("grid kyb application persist (non-fatal):", e))

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
    const platformCustomerId = String(customer.platformCustomerId ?? "").trim()
    // Never persist historic shell tax ids, and don't clobber a corrected local EIN.
    if (kybFields.tax_id) {
      if (isGridShellBusinessTaxId(kybFields.tax_id, platformCustomerId)) {
        delete kybFields.tax_id
      } else if (String(priorBiz?.tax_id ?? "").trim()) {
        delete kybFields.tax_id
      }
    }
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
      kybApproved: status === "approved",
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
