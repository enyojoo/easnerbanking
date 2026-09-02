import { afterEach, describe, expect, it } from "vitest"
import { isVelocityOutboundEnforced, walletSendComplianceConfig } from "./config"

describe("walletSendComplianceConfig", () => {
  const prevShadow = process.env.WALLET_SEND_VELOCITY_SHADOW_MODE

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.WALLET_SEND_VELOCITY_SHADOW_MODE
    else process.env.WALLET_SEND_VELOCITY_SHADOW_MODE = prevShadow
  })

  it("defaults velocity shadow mode to off (outbound caps enforced)", () => {
    delete process.env.WALLET_SEND_VELOCITY_SHADOW_MODE
    expect(walletSendComplianceConfig().shadowMode).toBe(false)
  })

  it("treats active velocity as enforced when shadow mode is off", () => {
    delete process.env.WALLET_SEND_VELOCITY_SHADOW_MODE
    expect(isVelocityOutboundEnforced(true)).toBe(true)
    expect(isVelocityOutboundEnforced(false)).toBe(false)
  })

  it("skips outbound velocity caps only when shadow mode is explicitly enabled", () => {
    process.env.WALLET_SEND_VELOCITY_SHADOW_MODE = "true"
    expect(isVelocityOutboundEnforced(true)).toBe(false)
  })
})
