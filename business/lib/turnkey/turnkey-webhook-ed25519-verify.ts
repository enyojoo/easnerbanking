import { createHash } from "node:crypto"
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

/** Turnkey-recommended Ed25519 verify (@noble/curves) over canonical signed input bytes. */
export function verifyTurnkeyCanonicalEd25519Noble(
  signedInput: Buffer,
  signature: Buffer,
  publicKey32: Buffer,
): boolean {
  if (signedInput.length === 0 || signature.length !== 64 || publicKey32.length !== 32) return false
  try {
    return ed25519.verify(
      new Uint8Array(signature),
      new Uint8Array(signedInput),
      new Uint8Array(publicKey32),
    )
  } catch {
    return false
  }
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

  return verifyTurnkeyCanonicalEd25519Noble(signedInput, Buffer.from(sigHex, "hex"), publicKey32)
}

/** Diagnostics for Turnkey support when canonical verify fails (no raw body logged). */
export function turnkeyWebhookEd25519FailureDiagnostics(
  input: TurnkeyWebhookV1SignedMessageInput,
  rawBody: Buffer,
): Record<string, string | number> {
  const signedInput = buildTurnkeyWebhookV1SignedMessage(input)
  const prefixLen = signedInput ? signedInput.length - rawBody.length : 0
  const version = input.signatureVersion?.trim() || "v1"
  const algorithm = input.algorithm?.trim() || "ed25519"
  const signingKeyId = input.signingKeyId?.trim() || "turnkey_webhook_signing_key_001"
  const prefixPreview = `${version}.${algorithm}.${signingKeyId}.${input.timestampForSigning.trim()}.${input.eventId.trim()}.`

  return {
    canonicalPrefixPreview: prefixPreview,
    canonicalPrefixBytes: prefixLen,
    signedInputSha256: signedInput ? createHash("sha256").update(signedInput).digest("hex") : "",
    rawBodySha256: createHash("sha256").update(rawBody).digest("hex"),
    rawBodyBytes: rawBody.length,
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
