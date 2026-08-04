import { afterEach, describe, expect, it, vi } from "vitest"
import { evaluateIdlePolicy } from "@/lib/app-idle-policy"
import {
  __resetIdleLockSuspendForTests,
  beginIdleLockSuspend,
  endIdleLockSuspend,
  isIdleLockSuspended,
} from "@/lib/session-activity"

vi.mock("@/lib/login-pin", () => ({
  hasPin: () => true,
  isLoginPinModuleAvailable: () => true,
  setAppLocked: vi.fn(),
}))

vi.mock("@/lib/app-lock-bus", () => ({
  emitAppLocked: vi.fn(),
}))

describe("idle lock suspend", () => {
  afterEach(() => {
    __resetIdleLockSuspendForTests()
    vi.restoreAllMocks()
  })

  it("is reference-counted", () => {
    expect(isIdleLockSuspended()).toBe(false)
    beginIdleLockSuspend()
    beginIdleLockSuspend()
    expect(isIdleLockSuspended()).toBe(true)
    endIdleLockSuspend()
    expect(isIdleLockSuspended()).toBe(true)
    endIdleLockSuspend()
    expect(isIdleLockSuspended()).toBe(false)
  })

  it("keeps evaluateIdlePolicy ok while suspended even if activity is stale", async () => {
    const activity = await import("@/lib/session-activity")
    vi.spyOn(activity, "getLastActivityTimestamp").mockReturnValue(Date.now() - 60 * 60 * 1000)

    expect(evaluateIdlePolicy("user-1")).toBe("lock")

    beginIdleLockSuspend()
    expect(evaluateIdlePolicy("user-1")).toBe("ok")
    endIdleLockSuspend()
  })
})
