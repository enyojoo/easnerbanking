import { describe, expect, it, vi } from "vitest"
import {
  accessForSurface,
  MAINTENANCE_MODE_BUSINESS_KEY,
  platformMaintenanceMessage,
  readPlatformAccess,
  REGISTRATION_CLOSED_CODE,
  registrationClosedBlock,
  registrationClosedMessage,
} from "./platform-access"

function adminWithRows(rows: Array<{ key: string; value: string }>) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  }
}

describe("readPlatformAccess", () => {
  it("defaults to maintenance off and registration on when rows are missing", async () => {
    const access = await readPlatformAccess(adminWithRows([]) as never)
    expect(access).toEqual({
      business: { maintenance: false, registration: true },
      personal: { maintenance: false, registration: true },
      minNativeVersionPersonal: "",
    })
  })

  it("reads per-product flags independently", async () => {
    const access = await readPlatformAccess(
      adminWithRows([
        { key: MAINTENANCE_MODE_BUSINESS_KEY, value: "true" },
        { key: "registration_enabled_personal", value: "false" },
      ]) as never,
    )
    expect(access.business.maintenance).toBe(true)
    expect(access.business.registration).toBe(true)
    expect(access.personal.maintenance).toBe(false)
    expect(access.personal.registration).toBe(false)
    expect(accessForSurface(access, "business_web").maintenance).toBe(true)
    expect(accessForSurface(access, "consumer_mobile").registration).toBe(false)
  })

  it("reads a valid personal min native version and ignores garbage", async () => {
    const valid = await readPlatformAccess(
      adminWithRows([{ key: "min_native_version_personal", value: "1.10.2" }]) as never,
    )
    expect(valid.minNativeVersionPersonal).toBe("1.10.2")
    const invalid = await readPlatformAccess(
      adminWithRows([{ key: "min_native_version_personal", value: "latest" }]) as never,
    )
    expect(invalid.minNativeVersionPersonal).toBe("")
  })

  it("reads system_settings on every call", async () => {
    const inn = vi.fn().mockResolvedValue({ data: [], error: null })
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ in: inn }),
      }),
    }
    await readPlatformAccess(admin as never)
    await readPlatformAccess(admin as never)
    expect(inn).toHaveBeenCalledTimes(2)
  })

  it("uses product-specific copy", () => {
    expect(platformMaintenanceMessage("business_web")).toContain("Business")
    expect(platformMaintenanceMessage("consumer_mobile")).toContain("app")
    expect(registrationClosedMessage("business_web")).toContain("Business")
    expect(REGISTRATION_CLOSED_CODE).toBe("REGISTRATION_CLOSED")
  })

  it("blocks signup-precheck when registration is closed for that surface only", async () => {
    const access = await readPlatformAccess(
      adminWithRows([{ key: "registration_enabled_business", value: "false" }]) as never,
    )
    expect(registrationClosedBlock(access, "business_web")?.code).toBe(REGISTRATION_CLOSED_CODE)
    expect(registrationClosedBlock(access, "consumer_mobile")).toBeNull()
  })
})
