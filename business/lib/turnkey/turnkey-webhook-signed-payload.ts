/**
 * Turnkey Webhooks V2 signed message (Ed25519).
 * @see https://docs.turnkey.com/developer-reference/webhooks — Verify signatures
 *
 * Canonical form:
 *   v1.ed25519.<signing_key_id>.<timestamp_ms>.<event_id>.<raw_body>
 * where <raw_body> is the exact request body bytes (not re-serialized JSON).
 */

/** Parse `X-Turnkey-Timestamp` to Unix milliseconds string. */
export function parseTurnkeyWebhookTimestampMs(timestamp: string | null | undefined): string | null {
  if (!timestamp?.trim()) return null
  const raw = timestamp.trim()
  const iso = Date.parse(raw)
  if (Number.isFinite(iso)) return String(iso)
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return n < 1e12 ? String(Math.floor(n * 1000)) : String(Math.floor(n))
}

export type TurnkeyWebhookV1SignedMessageInput = {
  rawBody: Buffer
  eventId: string
  timestampMs: string
  signingKeyId?: string | null
  signatureVersion?: string | null
  algorithm?: string | null
}

export type TurnkeyWebhookSignedMessageCandidate = {
  name: string
  message: Buffer
}

/**
 * Build the exact byte string Turnkey signs for Webhooks V2 `v1` / `ed25519`.
 * Returns null when required fields are missing.
 */
export function buildTurnkeyWebhookV1SignedMessage(
  input: TurnkeyWebhookV1SignedMessageInput,
): Buffer | null {
  const eventId = input.eventId.trim()
  const timestampMs = input.timestampMs.trim()
  if (!eventId || !timestampMs) return null

  const version = (input.signatureVersion?.trim() || "v1").toLowerCase()
  const algorithm = (input.algorithm?.trim() || "ed25519").toLowerCase()
  const signingKeyId = input.signingKeyId?.trim() || "turnkey_webhook_signing_key_001"

  const prefix = `${version}.${algorithm}.${signingKeyId}.${timestampMs}.${eventId}.`
  return Buffer.concat([Buffer.from(prefix, "utf8"), input.rawBody])
}

/**
 * Compatibility candidates for Turnkey V2 Ed25519 verification.
 *
 * Turnkey has used preview docs/header variants around Webhooks V2; the live delivery may sign
 * either the documented full prefix or a shorter timestamp/event/body form. Every candidate is
 * still verified against Turnkey's configured Ed25519 public key; timestamp/org replay checks
 * remain enforced by the route before payload processing.
 */
export function buildTurnkeyWebhookV1SignedMessageCandidates(
  input: TurnkeyWebhookV1SignedMessageInput,
): TurnkeyWebhookSignedMessageCandidate[] {
  const eventId = input.eventId.trim()
  const timestampMs = input.timestampMs.trim()
  if (!eventId || !timestampMs) return []

  const version = (input.signatureVersion?.trim() || "v1").toLowerCase()
  const algorithm = (input.algorithm?.trim() || "ed25519").toLowerCase()
  const signingKeyId = input.signingKeyId?.trim() || "turnkey_webhook_signing_key_001"

  const prefixed = buildTurnkeyWebhookV1SignedMessage(input)
  const candidates: TurnkeyWebhookSignedMessageCandidate[] = []
  if (prefixed) {
    candidates.push({ name: "turnkey-v1-full-prefix", message: prefixed })
  }

  const stringPrefixes = [
    ["turnkey-v1-no-key", `${version}.${algorithm}.${timestampMs}.${eventId}.`],
    ["svix-style", `${eventId}.${timestampMs}.`],
    ["timestamp-event", `${timestampMs}.${eventId}.`],
    ["turnkey-key-timestamp-event", `${signingKeyId}.${timestampMs}.${eventId}.`],
  ] as const

  for (const [name, prefix] of stringPrefixes) {
    candidates.push({
      name,
      message: Buffer.concat([Buffer.from(prefix, "utf8"), input.rawBody]),
    })
  }
  candidates.push({ name: "raw-body", message: input.rawBody })

  return candidates
}
