import { describe, expect, it } from "vitest"
import crypto from "crypto"
import {
  diagnoseBridgeWebhookVerification,
  normalizeBridgeWebhookPublicKeyPem,
} from "./webhook-verify"

function rsaPair() {
  return crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
}

function signBridgeOfficial(privateKey: crypto.KeyObject, timestamp: string, body: Buffer): string {
  const signedPayload = `${timestamp}.${body.toString("utf8")}`
  const digest = crypto.createHash("sha256").update(signedPayload).digest()
  const signer = crypto.createSign("RSA-SHA256")
  signer.update(digest)
  return signer.sign(privateKey, "base64")
}

function signBridgeSingleHash(privateKey: crypto.KeyObject, timestamp: string, body: Buffer): string {
  const payload = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), body])
  return crypto.sign("sha256", payload, privateKey).toString("base64")
}

describe("normalizeBridgeWebhookPublicKeyPem", () => {
  it("rebuilds a PEM when Vercel stores KEY= plus newlines", () => {
    const { publicKey, privateKey } = rsaPair()
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString()
    const vercelValue = `BRIDGE_WEBHOOK_PUBLIC_KEY=${pem}`
    const body = Buffer.from('{"ok":true}')
    const timestamp = String(Date.now())
    const signedPayload = `${timestamp}.${body.toString("utf8")}`
    const digest = crypto.createHash("sha256").update(signedPayload).digest()
    const signer = crypto.createSign("RSA-SHA256")
    signer.update(digest)
    const header = `t=${timestamp},v0=${signer.sign(privateKey, "base64")}`

    expect(normalizeBridgeWebhookPublicKeyPem(vercelValue)).toContain("BEGIN PUBLIC KEY")
    expect(diagnoseBridgeWebhookVerification(body, header, vercelValue)).toMatchObject({ ok: true })
  })
})

describe("diagnoseBridgeWebhookVerification", () => {
  const body = Buffer.from(JSON.stringify({ event_type: "customer.updated", event_id: "evt_1" }))

  it("accepts Bridge's documented SHA-256-then-RSA signature", () => {
    const { publicKey, privateKey } = rsaPair()
    const timestamp = String(Date.now())
    const signature = signBridgeOfficial(privateKey, timestamp, body)
    const header = `t=${timestamp},v0=${signature}`

    expect(
      diagnoseBridgeWebhookVerification(body, header, publicKey.export({ type: "spki", format: "pem" }).toString()),
    ).toMatchObject({ ok: true })
  })

  it("still accepts a single-hash RSA signature", () => {
    const { publicKey, privateKey } = rsaPair()
    const timestamp = String(Date.now())
    const signature = signBridgeSingleHash(privateKey, timestamp, body)
    const header = `t=${timestamp},v0=${signature}`

    expect(
      diagnoseBridgeWebhookVerification(body, header, publicKey.export({ type: "spki", format: "pem" }).toString()),
    ).toMatchObject({ ok: true })
  })

  it("rejects a signature from another key", () => {
    const { privateKey } = rsaPair()
    const other = rsaPair()
    const timestamp = String(Date.now())
    const signature = signBridgeOfficial(privateKey, timestamp, body)
    const header = `t=${timestamp},v0=${signature}`

    expect(
      diagnoseBridgeWebhookVerification(
        body,
        header,
        other.publicKey.export({ type: "spki", format: "pem" }).toString(),
      ),
    ).toMatchObject({ ok: false, code: "INVALID_SIGNATURE" })
  })
})
