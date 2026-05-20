import { afterAll, describe, expect, it } from "vitest"
import { createHmac } from "node:crypto"
import { verifyTurnkeyWebhookSignature } from "@/lib/turnkey/webhook-verify"

describe("verifyTurnkeyWebhookSignature", () => {
  const prevSecret = process.env.TURNKEY_WEBHOOK_SECRET
  const prevNode = process.env.NODE_ENV

  it("accepts hex HMAC digest", () => {
    process.env.TURNKEY_WEBHOOK_SECRET = "testsecret"
    process.env.NODE_ENV = "production"
    const raw = Buffer.from('{"hello":1}', "utf8")
    const expected = createHmac("sha256", "testsecret").update(raw).digest("hex")
    expect(verifyTurnkeyWebhookSignature(raw, `sha256=${expected}`)).toBe(true)
    expect(verifyTurnkeyWebhookSignature(raw, `0x${expected}`)).toBe(true)
  })

  it("accepts base64 HMAC digest", () => {
    process.env.TURNKEY_WEBHOOK_SECRET = "testsecret"
    process.env.NODE_ENV = "production"
    const raw = Buffer.from("body", "utf8")
    const mac = createHmac("sha256", "testsecret").update(raw).digest()
    const b64 = mac.toString("base64")
    expect(verifyTurnkeyWebhookSignature(raw, b64)).toBe(true)
  })

  it("rejects wrong secret", () => {
    process.env.TURNKEY_WEBHOOK_SECRET = "a"
    process.env.NODE_ENV = "production"
    const raw = Buffer.from("x", "utf8")
    const wrong = createHmac("sha256", "b").update(raw).digest("hex")
    expect(verifyTurnkeyWebhookSignature(raw, wrong)).toBe(false)
  })

  it("rejects non-HMAC algorithm when V2 metadata present", () => {
    process.env.TURNKEY_WEBHOOK_SECRET = "testsecret"
    process.env.NODE_ENV = "production"
    const raw = Buffer.from("body", "utf8")
    const expected = createHmac("sha256", "testsecret").update(raw).digest("hex")
    expect(
      verifyTurnkeyWebhookSignature(raw, expected, {
        algorithm: "ed25519",
        keyId: "key-1",
        version: "1",
      }),
    ).toBe(false)
  })

  afterAll(() => {
    process.env.TURNKEY_WEBHOOK_SECRET = prevSecret
    process.env.NODE_ENV = prevNode
  })
})
