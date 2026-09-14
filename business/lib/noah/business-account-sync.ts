import type { BusinessProfile } from "@/lib/use-business-profile"

/** Org KYB approved (`tier1Complete` from profile: Grid or Bridge). */
export function isBusinessTier1Complete(
  profile: Pick<BusinessProfile, "tier1Complete"> | null | undefined,
): boolean {
  return Boolean(profile?.tier1Complete)
}

/**
 * After KYB approval, keep background sync until Grid reports receive rails ready
 * (Turnkey deposit vaults; fiat VAs live in `virtual_accounts`).
 */
export function needsBusinessVirtualAccountProvision(
  profile: Pick<BusinessProfile, "tier1Complete"> | null | undefined,
  opts?: { fiatProvisionResolved?: boolean },
): boolean {
  if (opts?.fiatProvisionResolved) return false
  if (!isBusinessTier1Complete(profile)) return false
  return true
}
