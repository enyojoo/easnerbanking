import { afterAll, describe, expect, it } from "vitest"
import { createHmac } from "node:crypto"
import {
  computeYellowcardWebhookSignature,
  diagnoseYellowcardWebhookVerification,
  verifyYellowcardWebhookSignature,
} from "@/lib/yellowcard/webhook-verify"

describe("verifyYellowcardWebhookSignature", () => {
  const secret = "yc-webhook-test-secret"
  const prev = process.env.YELLOWCARD_API_SECRET

  it("accepts base64 HMAC-SHA256 of raw body", () => {
    const raw = Buffer.from('{"event":"SEND.COMPLETE","id":"abc"}', "utf8")
    const sig = createHmac("sha256", secret).update(raw).digest("base64")
    expect(verifyYellowcardWebhookSignature(raw, sig, secret)).toBe(true)
    expect(computeYellowcardWebhookSignature(raw, secret)).toBe(sig)
  })

  it("rejects wrong secret", () => {
    const raw = Buffer.from("body", "utf8")
    const wrong = createHmac("sha256", "other").update(raw).digest("base64")
    expect(verifyYellowcardWebhookSignature(raw, wrong, secret)).toBe(false)
  })

  it("rejects missing signature", () => {
    expect(verifyYellowcardWebhookSignature(Buffer.from("x"), null, secret)).toBe(false)
  })

  it("diagnose reports codes", () => {
    expect(diagnoseYellowcardWebhookVerification(Buffer.alloc(0), "x", secret).code).toBe(
      "EMPTY_BODY",
    )
    expect(diagnoseYellowcardWebhookVerification(Buffer.from("a"), null, secret).code).toBe(
      "MISSING_SIGNATURE",
    )
    const raw = Buffer.from("ok", "utf8")
    const sig = createHmac("sha256", secret).update(raw).digest("base64")
    expect(diagnoseYellowcardWebhookVerification(raw, sig, secret).ok).toBe(true)
  })

  afterAll(() => {
    process.env.YELLOWCARD_API_SECRET = prev
  })
})
