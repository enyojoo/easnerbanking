import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { applyIdlePolicy, evaluateIdlePolicy } from "@/lib/app-idle-policy"

let locked = false

vi.mock("@/lib/login-pin", () => ({
  hasPin: () => true,
  isLoginPinModuleAvailable: () => true,
  setAppLocked: (_userId: string, value: boolean) => {
    locked = value
  },
  isAppLocked: () => locked,
}))

vi.mock("@/lib/app-lock-bus", () => ({
  emitAppLocked: vi.fn(),
}))

describe("applyIdlePolicy", () => {
  beforeEach(async () => {
    locked = false
    const { emitAppLocked } = await import("@/lib/app-lock-bus")
    vi.mocked(emitAppLocked).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("emits lock once, not on every idle re-check", async () => {
    const activity = await import("@/lib/session-activity")
    vi.spyOn(activity, "getLastActivityTimestamp").mockReturnValue(Date.now() - 60 * 60 * 1000)
    const { emitAppLocked } = await import("@/lib/app-lock-bus")

    expect(evaluateIdlePolicy("user-1")).toBe("lock")
    expect(applyIdlePolicy("user-1")).toBe("lock")
    expect(emitAppLocked).toHaveBeenCalledTimes(1)
    expect(locked).toBe(true)

    expect(applyIdlePolicy("user-1")).toBe("lock")
    expect(applyIdlePolicy("user-1")).toBe("lock")
    expect(emitAppLocked).toHaveBeenCalledTimes(1)
  })

  it("does not emit when activity is still fresh", async () => {
    const activity = await import("@/lib/session-activity")
    vi.spyOn(activity, "getLastActivityTimestamp").mockReturnValue(Date.now())
    const { emitAppLocked } = await import("@/lib/app-lock-bus")

    expect(applyIdlePolicy("user-1")).toBe("ok")
    expect(emitAppLocked).not.toHaveBeenCalled()
    expect(locked).toBe(false)
  })
})
