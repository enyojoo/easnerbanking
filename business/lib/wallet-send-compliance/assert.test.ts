import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  FIAT_PAYOUT_DAILY_LIMIT_CODE,
  WALLET_SEND_DAILY_LIMIT_CODE,
  WALLET_SEND_VELOCITY_LIMIT_CODE,
} from "@easner/shared"

vi.mock("./resolve-send-allowance", () => ({
  resolveSendAllowance: vi.fn(),
}))

import { resolveSendAllowance } from "./resolve-send-allowance"
import {
  assertOutboundComplianceAllows,
  OutboundComplianceError,
  outboundComplianceCatchResponse,
  outboundComplianceSendFailureResponse,
} from "./assert"

describe("outboundComplianceSendFailureResponse", () => {
  it("returns 403 for wallet send compliance failure codes", async () => {
    const res = outboundComplianceSendFailureResponse({
      state: "failed",
      code: WALLET_SEND_VELOCITY_LIMIT_CODE,
      message: "Recent large deposits are under review.",
    })
    expect(res).not.toBeNull()
    expect(res?.status).toBe(403)
    const body = await res!.json()
    expect(body.code).toBe(WALLET_SEND_VELOCITY_LIMIT_CODE)
    expect(body.error).toContain("under review")
  })

  it("returns 403 for daily limit failures", async () => {
    const res = outboundComplianceSendFailureResponse({
      state: "failed",
      code: WALLET_SEND_DAILY_LIMIT_CODE,
      message: "Daily limit reached.",
    })
    expect(res?.status).toBe(403)
  })

  it("returns 403 for fiat payout daily limit failures", async () => {
    const res = outboundComplianceSendFailureResponse({
      state: "failed",
      code: FIAT_PAYOUT_DAILY_LIMIT_CODE,
      message: "Fiat payout daily limit reached.",
    })
    expect(res?.status).toBe(403)
  })

  it("ignores non-compliance failures", () => {
    expect(
      outboundComplianceSendFailureResponse({
        state: "failed",
        code: "wallet_send_failed",
        message: "nope",
      }),
    ).toBeNull()
  })
})

describe("outboundComplianceCatchResponse", () => {
  it("maps OutboundComplianceError to 403 JSON", async () => {
    const res = outboundComplianceCatchResponse(
      new OutboundComplianceError(WALLET_SEND_DAILY_LIMIT_CODE, "Daily limit reached."),
    )
    expect(res?.status).toBe(403)
    const body = await res!.json()
    expect(body.code).toBe(WALLET_SEND_DAILY_LIMIT_CODE)
  })
})

describe("assertOutboundComplianceAllows", () => {
  beforeEach(() => {
    vi.mocked(resolveSendAllowance).mockReset()
  })

  it("allows when fiat/stablecoin allowance is allowed", async () => {
    vi.mocked(resolveSendAllowance).mockResolvedValue({
      allowed: true,
      remainingUsd: 1000,
      dailyLimitUsd: 100_000,
      dailyUsedUsd: 0,
      dailyRemainingUsd: 100_000,
      dailyTier: null,
      velocityActive: false,
      velocityRemainingUsd: null,
      velocityExpiresAt: null,
      velocityMode: null,
      code: null,
      message: null,
    })
    const result = await assertOutboundComplianceAllows({} as never, {
      businessId: "biz",
      rail: "fiat_payout",
      amountUsd: 50,
    })
    expect(result).toEqual({ ok: true })
  })

  it("fails closed with a clear message when resolveSendAllowance throws", async () => {
    vi.mocked(resolveSendAllowance).mockRejectedValue(new ReferenceError("cfg is not defined"))
    const result = await assertOutboundComplianceAllows({} as never, {
      businessId: "biz",
      rail: "fiat_payout",
      amountUsd: 50,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.message).toMatch(/temporarily unavailable/i)
    }
  })
})
