import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  processJob: vi.fn(),
}))

vi.mock("@/lib/turnkey/config", () => ({
  isTurnkeyConfigured: () => true,
  isTurnkeyWalletAutoprovisionEnabled: () => true,
}))
vi.mock("@/lib/wallet/turnkey-wallet-db", () => ({
  enqueueVaultProvisioningJobs: mocks.enqueue,
}))
vi.mock("@/lib/wallet/turnkey-provisioning", () => ({
  processNextWalletProvisioningJob: mocks.processJob,
}))
vi.mock("@/lib/wallet/turnkey-create-sub-org", () => ({
  createEasnerTurnkeySubOrganization: vi.fn(),
}))

import { provisionPlatformCustomerVaults } from "./wallet-owner"

describe("provisionPlatformCustomerVaults", () => {
  it("enqueues USD and EUR vaults when the sub-org exists", async () => {
    mocks.enqueue.mockResolvedValue(undefined)
    mocks.processJob.mockResolvedValue({ processed: false, detail: "no_jobs" })
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { turnkey_sub_organization_id: "sub_1" } }),
          }),
        }),
      }),
    }
    await provisionPlatformCustomerVaults(admin as never, "wo_1")
    expect(mocks.enqueue).toHaveBeenCalled()
  })

  it("skips when there is no sub-org", async () => {
    mocks.enqueue.mockClear()
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { turnkey_sub_organization_id: null } }),
          }),
        }),
      }),
    }
    await provisionPlatformCustomerVaults(admin as never, "wo_1")
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
})
