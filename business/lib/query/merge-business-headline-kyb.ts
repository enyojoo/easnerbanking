import { publicBridgeKycHubStatus } from "@/lib/bridge/kyc-links"
import { resolveBusinessHeadlineKybStatus } from "@/lib/compliance/business-tier1"

function asIsoTimestamp(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function readNonEmptyStatus(value: unknown): string | null {
  const status = String(value ?? "").trim()
  return status || null
}

export type CachedBusinessKybHeadline = {
  tier1VerificationStatus?: string | null
  bridgeKycStatus?: string | null
  bridgeCustomerId?: string | null
  gridKybStatusUpdatedAt?: string | null
  bridgeKycStatusUpdatedAt?: string | null
}

/**
 * Combine a businesses realtime row with the cached profile so a one-rail
 * patch cannot drop the other rail to `not_started`.
 */
export function mergeBusinessHeadlineKybFromRealtime(
  row: Record<string, unknown>,
  cached: CachedBusinessKybHeadline | null | undefined,
): {
  gridStatus: string
  bridgeHubStatus: string | null
  bridgeCustomerId: string | null
  gridUpdatedAt: string | null
  bridgeUpdatedAt: string | null
  headlineVerificationStatus: string
} {
  const gridStatus =
    readNonEmptyStatus(row.verification_status) ||
    readNonEmptyStatus(cached?.tier1VerificationStatus) ||
    "not_started"
  const bridgeCustomerId =
    readNonEmptyStatus(row.bridge_customer_id) ||
    readNonEmptyStatus(cached?.bridgeCustomerId) ||
    null
  const bridgeRaw =
    readNonEmptyStatus(row.bridge_kyc_status) || readNonEmptyStatus(cached?.bridgeKycStatus)
  const bridgeHub = publicBridgeKycHubStatus({
    rawStatus: bridgeRaw,
    customerId: bridgeCustomerId,
  })
  const gridUpdatedAt =
    asIsoTimestamp(row.grid_kyb_status_updated_at) ?? asIsoTimestamp(cached?.gridKybStatusUpdatedAt)
  const bridgeUpdatedAt =
    asIsoTimestamp(row.bridge_kyc_status_updated_at) ??
    asIsoTimestamp(cached?.bridgeKycStatusUpdatedAt)
  return {
    gridStatus,
    bridgeHubStatus: bridgeHub.status,
    bridgeCustomerId,
    gridUpdatedAt,
    bridgeUpdatedAt,
    headlineVerificationStatus: resolveBusinessHeadlineKybStatus({
      gridStatus,
      bridgeStatus: bridgeHub.status,
      gridUpdatedAt,
      bridgeUpdatedAt,
    }),
  }
}
