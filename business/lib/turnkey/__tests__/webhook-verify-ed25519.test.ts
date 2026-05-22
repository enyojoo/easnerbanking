import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto"
import { buildTurnkeyWebhookV1SignedMessage } from "@/lib/turnkey/turnkey-webhook-signed-payload"
import { verifyTurnkeyWebhookSignature } from "@/lib/turnkey/webhook-verify"

describe("verifyTurnkeyWebhookSignature ed25519", () => {
  const prevKey = process.env.TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY
  const prevNode = process.env.NODE_ENV
  let testPrivateKey: KeyObject

  beforeAll(() => {
    process.env.NODE_ENV = "production"
    const { publicKey, privateKey } = generateKeyPairSync("ed25519")
    testPrivateKey = privateKey
    const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer
    process.env.TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY = spki.subarray(12).toString("hex")
  })

  afterAll(() => {
    process.env.TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY = prevKey
    process.env.NODE_ENV = prevNode
  })

  it("accepts hex signature over v1.ed25519 canonical message", () => {
    const rawBody = Buffer.from('{"type":"balances:confirmed"}', "utf8")
    const eventId = "019test-event"
    const timestampMs = "1747772156000"
    const message = buildTurnkeyWebhookV1SignedMessage({
      rawBody,
      eventId,
      timestampForSigning: timestampMs,
      signingKeyId: "turnkey_webhook_signing_key_001",
    })!
    const sig = sign(null, message, testPrivateKey)

    const ok = verifyTurnkeyWebhookSignature({
      rawBody,
      signatureHeader: sig.toString("hex"),
      meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
      eventId,
      timestamp: timestampMs,
    })
    expect(ok).toBe(true)
  })

  it("rejects tampered body", () => {
    const rawBody = Buffer.from("original", "utf8")
    const eventId = "evt-2"
    const timestampMs = "1740000000000"
    const message = buildTurnkeyWebhookV1SignedMessage({
      rawBody,
      eventId,
      timestampForSigning: timestampMs,
    })!
    const sig = sign(null, message, testPrivateKey)

    const ok = verifyTurnkeyWebhookSignature({
      rawBody: Buffer.from("tampered", "utf8"),
      signatureHeader: sig.toString("hex"),
      meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
      eventId,
      timestamp: timestampMs,
    })
    expect(ok).toBe(false)
  })

  it("accepts v1 ed25519 signature over shorter timestamp/event payload", () => {
    const rawBody = Buffer.from('{"type":"balances:confirmed"}', "utf8")
    const eventId = "evt-live-compatible"
    const timestampMs = "1747772156000"
    const message = Buffer.concat([
      Buffer.from(`v1.ed25519.${timestampMs}.${eventId}.`, "utf8"),
      rawBody,
    ])
    const sig = sign(null, message, testPrivateKey)

    const ok = verifyTurnkeyWebhookSignature({
      rawBody,
      signatureHeader: sig.toString("hex"),
      meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
      eventId,
      timestamp: timestampMs,
    })
    expect(ok).toBe(true)
  })

  it("accepts signatures that use the exact ISO timestamp header", () => {
    const rawBody = Buffer.from('{"type":"balances:confirmed"}', "utf8")
    const eventId = "evt-live-iso-timestamp"
    const timestamp = "2026-05-22T14:30:00.000Z"
    const message = Buffer.concat([
      Buffer.from(`v1.ed25519.turnkey_webhook_signing_key_001.${timestamp}.${eventId}.`, "utf8"),
      rawBody,
    ])
    const sig = sign(null, message, testPrivateKey)

    const ok = verifyTurnkeyWebhookSignature({
      rawBody,
      signatureHeader: sig.toString("hex"),
      meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
      eventId,
      timestamp,
    })
    expect(ok).toBe(true)
  })

  it("accepts timestamp + raw body signatures", () => {
    const rawBody = Buffer.from('{"type":"balances:confirmed"}', "utf8")
    const eventId = "evt-live-timestamp-body"
    const timestampMs = "1779465426522"
    const message = Buffer.concat([Buffer.from(`${timestampMs}.`, "utf8"), rawBody])
    const sig = sign(null, message, testPrivateKey)

    const ok = verifyTurnkeyWebhookSignature({
      rawBody,
      signatureHeader: sig.toString("hex"),
      meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
      eventId,
      timestamp: timestampMs,
    })
    expect(ok).toBe(true)
  })

  it("accepts Discord-style timestamp concat body signatures", () => {
    const rawBody = Buffer.from('{"type":"balances:confirmed"}', "utf8")
    const eventId = "evt-live-timestamp-concat"
    const timestampMs = "1779465426522"
    const message = Buffer.concat([Buffer.from(timestampMs, "utf8"), rawBody])
    const sig = sign(null, message, testPrivateKey)

    const ok = verifyTurnkeyWebhookSignature({
      rawBody,
      signatureHeader: sig.toString("hex"),
      meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
      eventId,
      timestamp: timestampMs,
    })
    expect(ok).toBe(true)
  })

  it("honors TURNKEY_WEBHOOK_STRICT_SIGNATURE with canonical payload only", () => {
    const prevStrict = process.env.TURNKEY_WEBHOOK_STRICT_SIGNATURE
    process.env.TURNKEY_WEBHOOK_STRICT_SIGNATURE = "true"
    try {
      const rawBody = Buffer.from('{"type":"balances:confirmed"}', "utf8")
      const eventId = "evt-strict"
      const timestampMs = "1747772156000"
      const message = buildTurnkeyWebhookV1SignedMessage({
        rawBody,
        eventId,
        timestampForSigning: timestampMs,
        signingKeyId: "turnkey_webhook_signing_key_001",
      })!
      const sig = sign(null, message, testPrivateKey)

      expect(
        verifyTurnkeyWebhookSignature({
          rawBody,
          signatureHeader: sig.toString("hex"),
          meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
          eventId,
          timestamp: timestampMs,
        }),
      ).toBe(true)

      const shorter = Buffer.concat([
        Buffer.from(`v1.ed25519.${timestampMs}.${eventId}.`, "utf8"),
        rawBody,
      ])
      const compatSig = sign(null, shorter, testPrivateKey)
      expect(
        verifyTurnkeyWebhookSignature({
          rawBody,
          signatureHeader: compatSig.toString("hex"),
          meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
          eventId,
          timestamp: timestampMs,
        }),
      ).toBe(false)
    } finally {
      if (prevStrict === undefined) delete process.env.TURNKEY_WEBHOOK_STRICT_SIGNATURE
      else process.env.TURNKEY_WEBHOOK_STRICT_SIGNATURE = prevStrict
    }
  })

  it("accepts v1 ed25519 signature over raw body", () => {
    const rawBody = Buffer.from('{"type":"balances:confirmed","eventId":"evt-body"}', "utf8")
    const eventId = "evt-body"
    const timestampMs = "1747772156000"
    const sig = sign(null, rawBody, testPrivateKey)

    const ok = verifyTurnkeyWebhookSignature({
      rawBody,
      signatureHeader: sig.toString("hex"),
      meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
      eventId,
      timestamp: timestampMs,
    })
    expect(ok).toBe(true)
  })
})
