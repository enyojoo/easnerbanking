import { afterEach, describe, expect, it, vi } from "vitest"
import { isPinBlockingWorkspace, readInitialPinState, resolvePinGate } from "@/lib/pin-gate"

const pin = vi.hoisted(() => ({
  hasPin: true,
  available: true,
  locked: false,
}))

vi.mock("@/lib/login-pin", () => ({
  hasPin: () => pin.hasPin,
  isLoginPinModuleAvailable: () => pin.available,
  isAppLocked: () => pin.locked,
}))

vi.mock("@/lib/app-idle-policy", () => ({
  evaluateIdlePolicy: () => (pin.locked ? "lock" : "ok"),
}))

vi.mock("@/lib/query/web-persist", () => ({
  probeStoredSupabaseSession: () => ({ likelyAuthenticated: false, userId: null }),
}))

describe("pin gate", () => {
  afterEach(() => {
    pin.hasPin = true
    pin.available = true
    pin.locked = false
  })

  it("opens the workspace when the user has a PIN and is not idle-locked", () => {
    expect(resolvePinGate("user-1")).toBe("open")
    expect(isPinBlockingWorkspace("user-1")).toBe(false)
  })

  it("shows unlock when the app is locked", () => {
    pin.locked = true
    expect(resolvePinGate("user-1")).toBe("lock")
    expect(isPinBlockingWorkspace("user-1")).toBe(true)
  })

  it("shows setup when this device has no PIN", () => {
    pin.hasPin = false
    expect(resolvePinGate("user-1")).toBe("setup")
    expect(isPinBlockingWorkspace("user-1")).toBe(true)
  })

  it("does not paint workspace from a missing user id on the server", () => {
    expect(readInitialPinState()).toEqual({ gate: "pending", userId: null })
  })
})
