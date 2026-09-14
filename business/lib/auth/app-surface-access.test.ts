import { beforeEach, describe, expect, it, vi } from "vitest"

const from = vi.fn()

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from }),
}))

vi.mock("@/lib/business/claim-team-invite", () => ({
  hasPendingTeamInviteForEmail: vi.fn(async () => false),
}))

import { PLATFORM_MAINTENANCE_CODE } from "@/lib/platform-access"
import { validateAppSurfaceAccess } from "./app-surface-access"

function chain(result: { data: unknown; error: null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle, in: vi.fn().mockResolvedValue(result) })
  return { select: vi.fn().mockReturnValue({ eq, in: vi.fn().mockResolvedValue(result) }) }
}

describe("validateAppSurfaceAccess maintenance", () => {
  beforeEach(() => {
    from.mockReset()
  })

  it("returns PLATFORM_MAINTENANCE without treating office admins as the cause", async () => {
    from.mockImplementation((table: string) => {
      if (table === "admin_users") return chain({ data: null, error: null })
      if (table === "system_settings") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ key: "maintenance_mode_business", value: "true" }],
              error: null,
            }),
          }),
        }
      }
      return chain({ data: { role: "business", deleted_at: null }, error: null })
    })

    const result = await validateAppSurfaceAccess("user-1", "business_web")
    expect(result).toEqual({
      ok: false,
      status: 403,
      code: PLATFORM_MAINTENANCE_CODE,
      message: "Easner Business is temporarily unavailable.",
    })
  })

  it("does not apply business maintenance to mobile", async () => {
    from.mockImplementation((table: string) => {
      if (table === "admin_users") return chain({ data: null, error: null })
      if (table === "system_settings") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ key: "maintenance_mode_business", value: "true" }],
              error: null,
            }),
          }),
        }
      }
      return chain({ data: { role: "individual", deleted_at: null }, error: null })
    })

    await expect(validateAppSurfaceAccess("user-2", "consumer_mobile")).resolves.toEqual({ ok: true })
  })
})
