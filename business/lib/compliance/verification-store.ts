import type { SupabaseClient } from "@supabase/supabase-js"
import type { VerificationProvider, VerificationStatus, VerificationSubjectKind } from "./types"
import { mapNoahPartnerStatus } from "./map-partner-status"

export type StoredVerificationRow = {
  verification_provider: VerificationProvider | null
  verification_status: VerificationStatus | string | null
  verification_rejection_reasons?: unknown
  verified_at?: string | null
  grid_customer_id?: string | null
  bridge_customer_id?: string | null
  bridge_kyc_status?: string | null
  noah_kyc_status?: string | null
}

export async function readVerificationRow(
  admin: SupabaseClient,
  input: { kind: VerificationSubjectKind; businessId?: string | null; userId: string },
): Promise<StoredVerificationRow | null> {
  if (input.kind === "business") {
    if (!input.businessId) return null
    const { data, error } = await admin
      .from("businesses")
      .select(
        "verification_provider,verification_status,verification_rejection_reasons,kyb_verified_at,grid_customer_id,bridge_customer_id,bridge_kyc_status",
      )
      .eq("id", input.businessId)
      .maybeSingle()
    if (error || !data) return null
    const row = data as Record<string, unknown>
    return {
      ...(row as StoredVerificationRow),
      verified_at: (row.kyb_verified_at as string | null | undefined) ?? null,
    }
  }

  const { data, error } = await admin
    .from("users")
    .select(
      "verification_provider,verification_status,verification_rejection_reasons,kyc_verified_at,grid_customer_id,bridge_customer_id,bridge_kyc_status,noah_kyc_status",
    )
    .eq("id", input.userId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as Record<string, unknown>
  return {
    ...(row as StoredVerificationRow),
    verified_at: (row.kyc_verified_at as string | null | undefined) ?? null,
  }
}

function isProgressedVerificationStatus(status: string): status is VerificationStatus {
  return (
    status === "approved" ||
    status === "in_progress" ||
    status === "pending" ||
    status === "rejected" ||
    status === "hold"
  )
}

export type KybRailTimestampColumn = "grid_kyb_status_updated_at" | "bridge_kyc_status_updated_at"

const KYB_RAIL_TIMESTAMP_COLUMNS: readonly KybRailTimestampColumn[] = [
  "grid_kyb_status_updated_at",
  "bridge_kyc_status_updated_at",
]

export function looksLikeMissingKybTimestampColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const maybe = error as { message?: string; details?: string; code?: string }
  const text = `${maybe.message || ""} ${maybe.details || ""}`.toLowerCase()
  const mentionsColumn = KYB_RAIL_TIMESTAMP_COLUMNS.some((column) => text.includes(column))
  return (
    mentionsColumn &&
    (maybe.code === "42703" ||
      maybe.code === "PGRST204" ||
      text.includes("schema cache") ||
      text.includes("column"))
  )
}

function withoutKybRailTimestamps(patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...patch }
  for (const column of KYB_RAIL_TIMESTAMP_COLUMNS) {
    delete next[column]
  }
  return next
}

async function updateBusinessesRow(
  admin: SupabaseClient,
  businessId: string,
  patch: Record<string, unknown>,
  label: string,
): Promise<void> {
  const first = await admin.from("businesses").update(patch).eq("id", businessId)
  if (!first.error) return
  if (!looksLikeMissingKybTimestampColumn(first.error)) {
    throw new Error(`${label}: ${first.error.message}`)
  }
  const retry = await admin.from("businesses").update(withoutKybRailTimestamps(patch)).eq("id", businessId)
  if (retry.error) throw new Error(`${label}: ${retry.error.message}`)
}

export function normalizeStoredKybStatus(raw: string | null | undefined): string {
  return String(raw ?? "").toLowerCase().trim() || "not_started"
}

/** Timestamp patch only when the stored rail status actually changes. */
export function kybStatusTimestampPatch(input: {
  previous: string | null | undefined
  next: string | null | undefined
  now: string
  column: KybRailTimestampColumn
}): Record<string, string> {
  if (normalizeStoredKybStatus(input.previous) === normalizeStoredKybStatus(input.next)) {
    return {}
  }
  return { [input.column]: input.now }
}

/**
 * Canonical KYC/KYB for money-movement gates.
 *
 * Business: Grid `verification_status` and Bridge `bridge_kyc_status` stay independent.
 * Either approved status unlocks the org. In-progress still prefers the Grid/canonical column.
 * Consumer Noah KYC: prefer progressed canonical values; fall back to Noah mirrors when stale.
 */
export function canonicalVerificationStatus(row: StoredVerificationRow | null): VerificationStatus {
  if (!row) return "not_started"
  const provider = String(row.verification_provider ?? "").toLowerCase()
  const direct = String(row.verification_status ?? "").toLowerCase()
  const bridge = String(row.bridge_kyc_status ?? "").toLowerCase()

  if (direct === "approved" || bridge === "approved") return "approved"

  if (provider === "grid" || provider === "bridge") {
    return isProgressedVerificationStatus(direct) ? direct : "not_started"
  }

  if (isProgressedVerificationStatus(direct)) {
    return direct
  }
  if (isProgressedVerificationStatus(bridge)) {
    return bridge
  }
  return mapNoahPartnerStatus(row.noah_kyc_status)
}

export async function persistVerificationStatus(
  admin: SupabaseClient,
  input: {
    kind: VerificationSubjectKind
    businessId?: string | null
    userId: string
    provider: VerificationProvider
    status: VerificationStatus
    rejectionReasons?: unknown
    verifiedAt?: string | null
    gridCustomerId?: string | null
    bridgeCustomerId?: string | null
    extra?: Record<string, unknown>
  },
): Promise<void> {
  const now = new Date().toISOString()
  if (input.kind === "business" && input.businessId) {
    const { data: current } = await admin
      .from("businesses")
      .select("verification_status,bridge_kyc_status")
      .eq("id", input.businessId)
      .maybeSingle()

    if (input.provider === "bridge") {
      const patch: Record<string, unknown> = {
        ...(input.bridgeCustomerId ? { bridge_customer_id: input.bridgeCustomerId } : {}),
        bridge_kyc_status: input.status,
        updated_at: now,
        ...(input.extra ?? {}),
        ...kybStatusTimestampPatch({
          previous: current?.bridge_kyc_status as string | null | undefined,
          next: input.status,
          now,
          column: "bridge_kyc_status_updated_at",
        }),
      }
      await updateBusinessesRow(admin, input.businessId, patch, "persistVerificationStatus(business-bridge)")
      return
    }

    if (input.status === "not_started") {
      if (normalizeStoredKybStatus(current?.verification_status as string | null | undefined) === "approved") {
        return
      }
    }

    const patch: Record<string, unknown> = {
      verification_provider: input.provider,
      verification_status: input.status,
      verification_rejection_reasons: input.rejectionReasons ?? null,
      updated_at: now,
      ...(input.extra ?? {}),
      ...kybStatusTimestampPatch({
        previous: current?.verification_status as string | null | undefined,
        next: input.status,
        now,
        column: "grid_kyb_status_updated_at",
      }),
    }
    if (input.status === "approved") {
      patch.kyb_verified_at = input.verifiedAt ?? now
    } else {
      patch.kyb_verified_at = null
    }
    if (input.gridCustomerId) {
      patch.grid_customer_id = input.gridCustomerId
    }
    if (input.bridgeCustomerId) {
      patch.bridge_customer_id = input.bridgeCustomerId
    }
    await updateBusinessesRow(admin, input.businessId, patch, "persistVerificationStatus(business)")
    return
  }

  const patch: Record<string, unknown> = {
    verification_provider: input.provider,
    verification_status: input.status,
    verification_rejection_reasons: input.rejectionReasons ?? null,
    updated_at: now,
    ...(input.extra ?? {}),
  }
  if (input.status === "approved") {
    patch.kyc_verified_at = input.verifiedAt ?? now
  }
  if (input.gridCustomerId) {
    patch.grid_customer_id = input.gridCustomerId
  }
  if (input.bridgeCustomerId) {
    patch.bridge_customer_id = input.bridgeCustomerId
  }
  if (input.provider === "bridge") {
    patch.bridge_kyc_status = input.status
  }
  const { error } = await admin.from("users").update(patch).eq("id", input.userId)
  if (error) throw new Error(`persistVerificationStatus(user): ${error.message}`)
}

/** Clear a stale Grid customer and return the org to Begin verification. */
export async function resetBusinessKybToNotStarted(
  admin: SupabaseClient,
  businessId: string,
): Promise<void> {
  const now = new Date().toISOString()
  const { data: current } = await admin
    .from("businesses")
    .select("verification_status")
    .eq("id", businessId)
    .maybeSingle()
  await updateBusinessesRow(
    admin,
    businessId,
    {
      grid_customer_id: null,
      verification_status: "not_started",
      verification_rejection_reasons: null,
      kyb_verified_at: null,
      updated_at: now,
      ...kybStatusTimestampPatch({
        previous: current?.verification_status as string | null | undefined,
        next: "not_started",
        now,
        column: "grid_kyb_status_updated_at",
      }),
    },
    "resetBusinessKybToNotStarted",
  )
}
