import { buildParentSubOrgProvisioningPolicy, PARENT_PROVISIONING_POLICY_NAME } from "@/lib/turnkey/policies/parent-provisioning-policies"

describe("parent provisioning policies", () => {
  it("builds allow-create-sub-org policy for server root user", () => {
    const userId = "e6f9f85a-b503-4961-aaa0-7a0e8d96e706"
    const spec = buildParentSubOrgProvisioningPolicy(userId)
    expect(spec.policyName).toBe(PARENT_PROVISIONING_POLICY_NAME)
    expect(spec.effect).toBe("EFFECT_ALLOW")
    expect(spec.consensus).toContain(userId)
    expect(spec.condition).toContain("ORGANIZATION")
    expect(spec.condition).toContain("CREATE")
  })
})
