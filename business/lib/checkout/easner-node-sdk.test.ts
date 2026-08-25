import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  constructWebhookEvent,
  verifyWebhookSignature,
} from "../../../packages/easner-node/src/index"
import { signMerchantWebhookPayload } from "./secrets"

const SECRET = "easner_whsec_test_secret"

function sign(body: string, timestampSeconds: number): string {
  const signature = createHmac("sha256", SECRET)
    .update(`${timestampSeconds}.${body}`, "utf8")
    .digest("hex")
  return `t=${timestampSeconds},v1=${signature}`
}

describe("@easner/node webhook verification", () => {
  const body = JSON.stringify({ type: "checkout.completed", created: 1_700_000_000, data: { amount_cents: 4900 } })

  it("accepts the exact signature the platform produces", () => {
    const now = 1_700_000_000
    const header = signMerchantWebhookPayload({ secret: SECRET, body, timestampSeconds: now })
    expect(
      verifyWebhookSignature({ payload: body, signatureHeader: header, secret: SECRET, nowSeconds: now }),
    ).toBe(true)
  })

  it("rejects a tampered body", () => {
    const now = 1_700_000_000
    const header = sign(body, now)
    expect(
      verifyWebhookSignature({
        payload: body.replace("4900", "1"),
        signatureHeader: header,
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false)
  })

  it("rejects a stale timestamp outside tolerance", () => {
    const then = 1_700_000_000
    const header = sign(body, then)
    expect(
      verifyWebhookSignature({
        payload: body,
        signatureHeader: header,
        secret: SECRET,
        nowSeconds: then + 301,
      }),
    ).toBe(false)
  })

  it("constructs the event after verification", () => {
    const now = 1_700_000_000
    const header = sign(body, now)
    const event = constructWebhookEvent(body, header, SECRET, { nowSeconds: now })
    expect(event.type).toBe("checkout.completed")
    expect(event.data.amount_cents).toBe(4900)
    expect(() => constructWebhookEvent(body, "t=1,v1=bad", SECRET, { nowSeconds: now })).toThrow()
  })
})
