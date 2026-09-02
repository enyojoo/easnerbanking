import { describe, expect, it } from "vitest"
import {
  FIAT_PAYOUT_DAILY_LIMIT_CODE,
  WALLET_SEND_DAILY_LIMIT_CODE,
  WALLET_SEND_VELOCITY_LIMIT_CODE,
} from "@easner/shared"
import {
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
