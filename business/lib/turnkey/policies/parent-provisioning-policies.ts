export const PARENT_PROVISIONING_POLICY_NAME = "easner-server-allow-create-sub-org"

export type ParentProvisioningPolicySpec = {
  policyName: string
  effect: "EFFECT_ALLOW"
  consensus: string
  condition: string
  notes?: string
}

/**
 * Parent-org policy: server root user can create sub-orgs without 2-of-3 quorum.
 * @see https://docs.turnkey.com/features/policies/examples/access-control
 */
export function buildParentSubOrgProvisioningPolicy(serverRootUserId: string): ParentProvisioningPolicySpec {
  const userId = String(serverRootUserId ?? "").trim()
  if (!userId) throw new Error("serverRootUserId is required")

  return {
    policyName: PARENT_PROVISIONING_POLICY_NAME,
    effect: "EFFECT_ALLOW",
    consensus: `approvers.any(user, user.id == '${userId}')`,
    condition: "activity.resource == 'ORGANIZATION' && activity.action == 'CREATE'",
    notes: "Server API user auto-provisions customer sub-orgs after KYB/KYC approval.",
  }
}
