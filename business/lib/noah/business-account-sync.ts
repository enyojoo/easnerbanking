import type { BusinessProfile } from "@/lib/use-business-profile"

/** Org Tier 1 KYB approved (`noah_kyb_status === 'approved'`). */
export function isBusinessTier1Complete(
  profile: Pick<BusinessProfile, "tier1Complete"> | null | undefined,
): boolean {
  return Boolean(profile?.tier1Complete)
}

/**
 * After KYB approval, keep syncing until USD/EUR fiat VA ids are mirrored on `businesses`.
 */
export function needsBusinessVirtualAccountProvision(
  profile:
    | Pick<
        BusinessProfile,
        "tier1Complete" | "noahUsdVirtualAccountId" | "noahEurVirtualAccountId"
      >
    | null
    | undefined,
  opts?: { fiatProvisionResolved?: boolean },
): boolean {
  if (opts?.fiatProvisionResolved) return false
  if (!isBusinessTier1Complete(profile)) return false
  return !profile?.noahUsdVirtualAccountId || !profile?.noahEurVirtualAccountId
}
