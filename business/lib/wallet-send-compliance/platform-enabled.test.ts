import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isWalletSendCompliancePlatformEnabled,
  resetWalletSendCompliancePlatformCacheForTests,
  WALLET_SEND_COMPLIANCE_PLATFORM_KEY,
} from "./platform-enabled"

describe("isWalletSendCompliancePlatformEnabled", () => {
  afterEach(() => {
    resetWalletSendCompliancePlatformCacheForTests()
  })

  it("defaults to enabled when setting is missing", async () => {
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }
    await expect(
      isWalletSendCompliancePlatformEnabled(admin as never),
    ).resolves.toBe(true)
  })

  it("returns false when office disables the platform flag", async () => {
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { value: "false" },
              error: null,
            }),
          }),
        }),
      }),
    }
    await expect(
      isWalletSendCompliancePlatformEnabled(admin as never),
    ).resolves.toBe(false)
    expect(admin.from).toHaveBeenCalledWith("system_settings")
  })

  it("uses a stable setting key", () => {
    expect(WALLET_SEND_COMPLIANCE_PLATFORM_KEY).toBe("wallet_send_compliance_enabled")
  })
})
