import { isVerificationApproved } from "./map-partner-status"
import type { VerificationStatus } from "./types"

export type BusinessVerificationFields = {
  verification_status?: string | null
  verification_provider?: string | null
  verification_rejection_reasons?: unknown
  grid_customer_id?: string | null
  bridge_kyc_status?: string | null
}

function usesGridVerification(row: BusinessVerificationFields | null | undefined): boolean {
  return String(row?.verification_provider ?? "").toLowerCase() === "grid"
}

/** True when org KYB/compliance SoR is Grid (skip Noah KYB/VA fallback paths). */
export function businessUsesGridVerification(
  row: BusinessVerificationFields | null | undefined,
): boolean {
  return usesGridVerification(row)
}

/** US banking (Grid) status only – never mix with Bridge/Euro. */
export function businessTier1Status(row: BusinessVerificationFields | null | undefined): string | null {
  if (!row) return null
  const status = String(row.verification_status ?? "not_started").trim()
  return status || "not_started"
}

/** True when US banking KYB is approved (Grid `verification_status` only). */
export function isBusinessGridKybApproved(row: BusinessVerificationFields | null | undefined): boolean {
  const status = businessTier1Status(row)
  if (!status) return false
  return isVerificationApproved(status.toLowerCase() as VerificationStatus)
}

/** True when Euro banking KYB is approved (`bridge_kyc_status` only). */
export function isBusinessBridgeKybApproved(row: BusinessVerificationFields | null | undefined): boolean {
  return isVerificationApproved(String(row?.bridge_kyc_status ?? "").toLowerCase() as VerificationStatus)
}

/**
 * Org KYB complete: Grid approved OR Bridge approved.
 * Columns stay independent so finishing one rail does not overwrite the other.
 */
export function isBusinessTier1Complete(row: BusinessVerificationFields | null | undefined): boolean {
  return isBusinessGridKybApproved(row) || isBusinessBridgeKybApproved(row)
}

export function businessTier1RejectionReasons(
  row: BusinessVerificationFields | null | undefined,
): unknown[] | null {
  if (!row) return null
  const reasons = row.verification_rejection_reasons
  return Array.isArray(reasons) ? reasons : null
}

/** Grid customer id for hosted KYB. */
export function businessHostedKybCustomerId(
  row: BusinessVerificationFields | null | undefined,
): string | null {
  if (!row) return null
  const gridId = String(row.grid_customer_id ?? "").trim()
  return gridId || null
}

function normalizeHeadlineStatus(raw: string | null | undefined): string {
  return String(raw ?? "").toLowerCase().trim() || "not_started"
}

function isIdleHeadlineStatus(status: string): boolean {
  return status === "not_started"
}

function isApprovedHeadlineStatus(status: string): boolean {
  return status === "approved"
}

function parseHeadlineTime(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

function pickLegacyHeadlineStatus(grid: string, bridge: string): string {
  if (isIdleHeadlineStatus(grid) && isIdleHeadlineStatus(bridge)) return "not_started"
  if (isIdleHeadlineStatus(grid)) return bridge
  if (isIdleHeadlineStatus(bridge)) return grid
  if (grid === "rejected" && bridge !== "rejected") return bridge
  if (bridge === "rejected" && grid !== "rejected") return grid
  return grid
}

function pickLastChangedHeadlineStatus(
  grid: string,
  bridge: string,
  gridMs: number | null,
  bridgeMs: number | null,
): string {
  if (isIdleHeadlineStatus(grid) && isIdleHeadlineStatus(bridge)) return "not_started"
  if (isIdleHeadlineStatus(grid)) return bridge
  if (isIdleHeadlineStatus(bridge)) return grid
  if (gridMs != null && bridgeMs != null) {
    if (bridgeMs > gridMs) return bridge
    if (gridMs > bridgeMs) return grid
  } else if (gridMs != null) {
    return grid
  } else if (bridgeMs != null) {
    return bridge
  }
  return pickLegacyHeadlineStatus(grid, bridge)
}

/**
 * Compact sidebar KYB status across Grid and Bridge.
 * Approved leads until the other rail has a later real status change.
 */
export function resolveBusinessHeadlineKybStatus(input: {
  gridStatus: string | null | undefined
  bridgeStatus: string | null | undefined
  gridUpdatedAt?: string | null
  bridgeUpdatedAt?: string | null
}): string {
  const grid = normalizeHeadlineStatus(input.gridStatus)
  const bridge = normalizeHeadlineStatus(input.bridgeStatus)
  const gridMs = parseHeadlineTime(input.gridUpdatedAt)
  const bridgeMs = parseHeadlineTime(input.bridgeUpdatedAt)
  const gridApproved = isApprovedHeadlineStatus(grid)
  const bridgeApproved = isApprovedHeadlineStatus(bridge)

  if (gridApproved || bridgeApproved) {
    if (gridApproved && bridgeApproved) return "approved"
    const other = gridApproved ? bridge : grid
    const otherMs = gridApproved ? bridgeMs : gridMs
    const approvedMs = gridApproved ? gridMs : bridgeMs
    if (isIdleHeadlineStatus(other)) return "approved"
    if (otherMs != null && approvedMs != null) {
      return otherMs > approvedMs ? other : "approved"
    }
    if (otherMs != null && approvedMs == null) return other
    if (otherMs == null && approvedMs != null) return "approved"
    return other
  }

  return pickLastChangedHeadlineStatus(grid, bridge, gridMs, bridgeMs)
}
