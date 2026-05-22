import { ed25519 } from "@noble/curves/ed25519"
import { buildTurnkeyWebhookV1SignedMessage } from "@/lib/turnkey/turnkey-webhook-signed-payload"
import type { TurnkeyWebhookV1SignedMessageInput } from "@/lib/turnkey/turnkey-webhook-signed-payload"

export type TurnkeyWebhookEd25519HeaderFields = {
  version: string
  algorithm: string
  keyId: string
  timestamp: string
  eventId: string
  signatureHex: string
}

/**
 * Turnkey-recommended Ed25519 verify (@noble/curves).
 * @see Turnkey support — `v1.<algorithm>.<keyId>.<timestamp>.<eventId>.<rawBody>`
 */
export function verifyTurnkeyWebhookEd25519Noble(
  fields: TurnkeyWebhookEd25519HeaderFields,
  rawBody: Buffer,
  publicKey32: Buffer,
): boolean {
  const signedInput = buildTurnkeyWebhookV1SignedMessage({
    rawBody,
    eventId: fields.eventId,
    timestampForSigning: fields.timestamp,
    signingKeyId: fields.keyId,
    signatureVersion: fields.version,
    algorithm: fields.algorithm,
  })
  if (!signedInput) return false

  const sigHex = fields.signatureHex.replace(/^0x/i, "").trim()
  if (!/^[0-9a-fA-F]{128}$/.test(sigHex)) return false
  if (publicKey32.length !== 32) return false

  try {
    return ed25519.verify(
      Buffer.from(sigHex, "hex"),
      signedInput,
      publicKey32,
    )
  } catch {
    return false
  }
}

/** Map verify input + resolved public key into Turnkey header fields for noble verify. */
export function turnkeyEd25519FieldsFromVerifyInput(
  input: TurnkeyWebhookV1SignedMessageInput & { signatureHeader: string },
): TurnkeyWebhookEd25519HeaderFields | null {
  const eventId = input.eventId.trim()
  const timestamp = input.timestampForSigning.trim()
  if (!eventId || !timestamp) return null

  const version = input.signatureVersion?.trim() || "v1"
  const algorithm = input.algorithm?.trim() || "ed25519"
  const keyId = input.signingKeyId?.trim() || "turnkey_webhook_signing_key_001"
  const signatureHex = input.signatureHeader.trim()
  if (!signatureHex) return null

  return { version, algorithm, keyId, timestamp, eventId, signatureHex }
}
