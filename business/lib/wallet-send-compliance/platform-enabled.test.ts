import { describe, expect, it, vi } from "vitest"
import {
  isWalletSendCompliancePlatformEnabled,
  WALLET_SEND_COMPLIANCE_PLATFORM_KEY,
} from "./platform-enabled"

describe("isWalletSendCompliancePlatformEnabled", () => {
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

  it("reads system_settings on every call (no server cache)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { value: "true" }, error: null })
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
    }
    await isWalletSendCompliancePlatformEnabled(admin as never)
    await isWalletSendCompliancePlatformEnabled(admin as never)
    expect(maybeSingle).toHaveBeenCalledTimes(2)
  })

  it("uses a stable setting key", () => {
    expect(WALLET_SEND_COMPLIANCE_PLATFORM_KEY).toBe("wallet_send_compliance_enabled")
  })
})
