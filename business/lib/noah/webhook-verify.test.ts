import { describe, expect, it } from "vitest"
import crypto from "crypto"
import {
  diagnoseNoahWebhookVerification,
  getNoahWebhookVerifyPublicKeys,
  NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION,
  splitWebhookSignatureHeader,
  verifyNoahWebhookSignature,
} from "./webhook-verify"

describe("verifyNoahWebhookSignature", () => {
  it("returns false when header is missing", () => {
    const d = diagnoseNoahWebhookVerification(Buffer.from("{}"), null)
    expect(d.ok).toBe(false)
    expect(d.code).toBe("MISSING_SIGNATURE")
  })

  it("verifies ECDSA SHA-384 signatures (Noah docs Node + Go patterns)", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "secp384r1",
    })
    const publicPem = publicKey.export({ type: "spki", format: "pem" }) as string
    const body = Buffer.from('{"EventType":"Customer"}', "utf8")

    const derSig = crypto.sign("sha384", body, privateKey)
    const rawSig = crypto.sign("sha384", body, { key: privateKey, dsaEncoding: "ieee-p1363" })

    const prev = process.env.NOAH_WEBHOOK_PUBLIC_KEY
    process.env.NOAH_WEBHOOK_PUBLIC_KEY = publicPem
    try {
      expect(verifyNoahWebhookSignature(body, derSig.toString("base64"))).toBe(true)
      expect(verifyNoahWebhookSignature(body, rawSig.toString("base64"))).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.NOAH_WEBHOOK_PUBLIC_KEY
      else process.env.NOAH_WEBHOOK_PUBLIC_KEY = prev
    }
  })

  it("defaults to production then sandbox keys when env unset", () => {
    const prevKey = process.env.NOAH_WEBHOOK_PUBLIC_KEY
    const prevEnv = process.env.NOAH_WEBHOOK_NOAH_ENV
    delete process.env.NOAH_WEBHOOK_PUBLIC_KEY
    delete process.env.NOAH_WEBHOOK_NOAH_ENV
    try {
      expect(getNoahWebhookVerifyPublicKeys()[0]).toBe(NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION)
    } finally {
      if (prevKey === undefined) delete process.env.NOAH_WEBHOOK_PUBLIC_KEY
      else process.env.NOAH_WEBHOOK_PUBLIC_KEY = prevKey
      if (prevEnv === undefined) delete process.env.NOAH_WEBHOOK_NOAH_ENV
      else process.env.NOAH_WEBHOOK_NOAH_ENV = prevEnv
    }
  })

  it("splits comma-separated signature headers", () => {
    expect(splitWebhookSignatureHeader("a,b")).toEqual(["a", "b"])
  })
})
