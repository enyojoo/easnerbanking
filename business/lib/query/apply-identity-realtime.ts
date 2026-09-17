"use client"

import type { QueryClient } from "@tanstack/react-query"
import {
  getVerificationRejectionDisplay,
  qk,
  type IdentityChangeEvent,
  type Scope,
} from "@easner/shared"
import { mergeBusinessHeadlineKybFromRealtime } from "@/lib/query/merge-business-headline-kyb"
import { CACHE_KEYS } from "@/lib/cache"
import {
  patchCachedBusinessProfile,
  peekCachedBusinessProfile,
  type BusinessProfile,
} from "@/lib/use-business-profile"
import { KYB_PACKET_QUERY_KEY } from "@/lib/grid/kyb-packet-query"
import type { KybPacket } from "@/lib/grid/kyb-packet-types"
import { fetchAndCacheConnectStatus } from "@/lib/stripe/connect-status-cache"

function readNonEmptyStatus(value: unknown): string | null {
  const status = String(value ?? "").trim()
  return status || null
}

/**
 * Bridge Grid KYB webhook writes into the business profile cache and KYB packet
 * without waiting for a full reload. Instant-patches status, then invalidates
 * so rejection copy and packet errors catch up from the API.
 */
export function applyBusinessIdentityRealtime(
  qc: QueryClient,
  scope: Scope,
  event: IdentityChangeEvent,
  userId?: string | null,
): void {
  if (event.table === "businesses") {
    const cached = peekCachedBusinessProfile(userId)
    const merged = mergeBusinessHeadlineKybFromRealtime(event.row, cached)
    const status = readNonEmptyStatus(event.row.verification_status)
    const bridgeStatus = readNonEmptyStatus(event.row.bridge_kyc_status)
    const patch: Partial<BusinessProfile> = {
      headlineVerificationStatus: merged.headlineVerificationStatus,
      gridKybStatusUpdatedAt: merged.gridUpdatedAt,
      bridgeKycStatusUpdatedAt: merged.bridgeUpdatedAt,
    }
    if (status) {
      const gridCustomerId = event.row.grid_customer_id
      const reasons = event.row.verification_rejection_reasons
      patch.tier1VerificationStatus = status
      patch.tier1RejectionReasons = Array.isArray(reasons)
        ? reasons
        : reasons == null
          ? null
          : [reasons]
      const rejectionDisplay = getVerificationRejectionDisplay(
        patch.tier1RejectionReasons,
        status,
      )
      patch.tier1CanResubmit = rejectionDisplay.canResubmit
      patch.tier1RejectionType = rejectionDisplay.rejectType
      if (gridCustomerId != null && gridCustomerId !== "") {
        patch.noahKybCustomerId = String(gridCustomerId)
      }
      // Never set complete false from Grid status — Bridge-approved orgs stay unlocked.
      if (status === "approved") patch.tier1Complete = true
    }
    if (bridgeStatus) {
      patch.bridgeKycStatus = merged.bridgeHubStatus
      patch.bridgeCustomerId = merged.bridgeCustomerId
      if (merged.bridgeHubStatus?.toLowerCase() === "approved") {
        patch.bridgeKycComplete = true
        patch.tier1Complete = true
      }
    }
    if (Object.keys(patch).length > 0) {
      patchCachedBusinessProfile(patch)
    }
  }

  if (event.table === "business_kyb_applications") {
    const nextStatus = String(event.row.status ?? "").trim()
    const packetKey = qk.verification.packet(scope)
    const patchPacket = (prev: KybPacket | undefined) => {
      if (!prev) return prev
      return {
        ...prev,
        status: (nextStatus || prev.status) as KybPacket["status"],
        errors: Array.isArray(event.row.last_errors) ? event.row.last_errors : prev.errors,
      }
    }
    qc.setQueryData(packetKey, patchPacket)
    qc.setQueryData(KYB_PACKET_QUERY_KEY, patchPacket)
  }

  if (
    event.table === "business_stripe_connect_accounts" ||
    event.table === "business_checkout_settings"
  ) {
    void fetchAndCacheConnectStatus(scope.kind === "business" ? scope.orgId : null)
  }

  if (event.table === "business_checkout_settings") {
    const enabled = event.row.online_payments_enabled
    if (typeof enabled === "boolean") {
      patchCachedBusinessProfile({ onlinePaymentsEnabled: enabled })
    }
  }

  const refreshBusinessProfile =
    event.table === "businesses" ||
    event.table === "business_kyb_applications" ||
    event.table === "business_checkout_settings"

  if (refreshBusinessProfile && userId) {
    qc.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === "business" &&
        query.queryKey[1] === "compat-cache" &&
        String(query.queryKey[2] ?? "") === CACHE_KEYS.BUSINESS_PROFILE(userId),
      refetchType: "active",
    })
  }

  if (refreshBusinessProfile && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("business-profile-updated"))
  }
}
