import { describe, expect, it, vi, beforeEach } from "vitest"

const {
  scheduleTurnkeyWalletsAfterKycApproved,
  trySyncTurnkeyDepositVaultsIfNeeded,
  provisionNoahArtifactsForCustomer,
  resolveBusinessOrgOwnerUserId,
} = vi.hoisted(() => ({
  scheduleTurnkeyWalletsAfterKycApproved: vi.fn().mockResolvedValue(undefined),
  trySyncTurnkeyDepositVaultsIfNeeded: vi.fn().mockResolvedValue(undefined),
  provisionNoahArtifactsForCustomer: vi.fn().mockResolvedValue({
    usdAccountCreated: true,
    eurAccountCreated: true,
  }),
  resolveBusinessOrgOwnerUserId: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/wallet/turnkey-provisioning", () => ({
  scheduleTurnkeyWalletsAfterKycApproved,
}))

vi.mock("@/lib/wallet/sync-deposit-vaults", () => ({
  trySyncTurnkeyDepositVaultsIfNeeded,
}))

vi.mock("./provisioning", () => ({
  provisionNoahArtifactsForCustomer,
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId,
}))

import { provisionNoahAfterVerificationApproved } from "./provision-after-approval"

describe("provisionNoahAfterVerificationApproved", () => {
  const admin = {} as import("@supabase/supabase-js").SupabaseClient

  beforeEach(() => {
    vi.clearAllMocks()
    resolveBusinessOrgOwnerUserId.mockResolvedValue(null)
  })

  it("schedules Turnkey vaults, drains inline, then provisions Noah artifacts", async () => {
    await provisionNoahAfterVerificationApproved({
      admin,
      scope: "individual",
      noahCustomerId: "eind_test",
      subjectUserId: "user-1",
      subjectBusinessId: null,
    })

    expect(scheduleTurnkeyWalletsAfterKycApproved.mock.invocationCallOrder[0]).toBeLessThan(
      trySyncTurnkeyDepositVaultsIfNeeded.mock.invocationCallOrder[0]!,
    )
    expect(trySyncTurnkeyDepositVaultsIfNeeded.mock.invocationCallOrder[0]).toBeLessThan(
      provisionNoahArtifactsForCustomer.mock.invocationCallOrder[0]!,
    )

    expect(scheduleTurnkeyWalletsAfterKycApproved).toHaveBeenCalledWith({
      scope: "individual",
      subjectUserId: "user-1",
      subjectBusinessId: null,
      noahCustomerId: "eind_test",
    })
    expect(trySyncTurnkeyDepositVaultsIfNeeded).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        scope: "individual",
        noahCustomerId: "eind_test",
        subjectUserId: "user-1",
        subjectBusinessId: null,
        customerType: "Individual",
      }),
    )
    expect(provisionNoahArtifactsForCustomer).toHaveBeenCalledWith({
      subjectUserId: "user-1",
      subjectBusinessId: null,
      noahCustomerId: "eind_test",
      scope: "individual",
      admin,
    })
  })

  it("resolves business org owner before scheduling and skips Noah VA provision", async () => {
    resolveBusinessOrgOwnerUserId.mockResolvedValueOnce("owner-user-id")

    const result = await provisionNoahAfterVerificationApproved({
      admin,
      scope: "business",
      noahCustomerId: "ebiz_test",
      subjectUserId: "session-user",
      subjectBusinessId: "biz-1",
    })

    expect(resolveBusinessOrgOwnerUserId).toHaveBeenCalledWith(admin, "biz-1")
    expect(scheduleTurnkeyWalletsAfterKycApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "business",
        subjectUserId: "owner-user-id",
        subjectBusinessId: "biz-1",
      }),
    )
    expect(provisionNoahArtifactsForCustomer).not.toHaveBeenCalled()
    expect(result).toEqual({ skipped: true, reason: "business_uses_grid_not_noah" })
  })
})
