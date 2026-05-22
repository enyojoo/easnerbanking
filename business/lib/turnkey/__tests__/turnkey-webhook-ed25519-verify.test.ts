import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { generateKeyPairSync, sign } from "node:crypto"
import { buildTurnkeyWebhookV1SignedMessage } from "@/lib/turnkey/turnkey-webhook-signed-payload"
import { verifyTurnkeyWebhookEd25519Noble } from "@/lib/turnkey/turnkey-webhook-ed25519-verify"

describe("verifyTurnkeyWebhookEd25519Noble", () => {
  let publicKeyHex: string
  let privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"]

  beforeAll(() => {
    const { publicKey, privateKey: priv } = generateKeyPairSync("ed25519")
    privateKey = priv
    const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer
    publicKeyHex = spki.subarray(12).toString("hex")
  })

  it("matches Turnkey support snippet (noble ed25519 + canonical prefix)", () => {
    const rawBody = Buffer.from('{"type":"balances:confirmed"}', "utf8")
    const fields = {
      version: "v1",
      algorithm: "ed25519",
      keyId: "turnkey_webhook_signing_key_001",
      timestamp: "1779468508161",
      eventId: "evt-turnkey-snippet",
    }
    const signedInput = buildTurnkeyWebhookV1SignedMessage({
      rawBody,
      eventId: fields.eventId,
      timestampForSigning: fields.timestamp,
      signingKeyId: fields.keyId,
      signatureVersion: fields.version,
      algorithm: fields.algorithm,
    })!
    const signatureHex = sign(null, signedInput, privateKey).toString("hex")

    const ok = verifyTurnkeyWebhookEd25519Noble(
      { ...fields, signatureHex },
      rawBody,
      Buffer.from(publicKeyHex, "hex"),
    )
    expect(ok).toBe(true)
  })

  it("verifies Turnkey platform public key format (64-char hex)", () => {
    const turnkeyPub = Buffer.from(
      "5ebf48061c8e5ca73f30381fbde77c47940bc2149c8ef37eff4faf36c5ba8f9a",
      "hex",
    )
    expect(turnkeyPub.length).toBe(32)
  })
})
