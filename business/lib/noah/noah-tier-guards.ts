/**
 * @deprecated Import from `@/lib/compliance/verification-guards` instead.
 * Re-exports preserved for existing imports during Grid KYB cutover.
 */
export {
  getVerificationStatus as getNoahVerificationStatus,
  isVerificationApprovedForScope as isNoahVerificationApproved,
  hasProvisionedArtifacts as hasNoahProvisionedArtifacts,
  requireVerificationApproved as requireNoahVerificationApproved,
  type VerificationScope as NoahVerificationScope,
} from "@/lib/compliance/verification-guards"
