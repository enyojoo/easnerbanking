/**
 * Turnkey Webhooks V2 signed message (Ed25519).
 * @see https://docs.turnkey.com/developer-reference/webhooks — Verify signatures
 *
 * Canonical form:
 *   v1.ed25519.<signing_key_id>.<timestamp>.<event_id>.<raw_body>
 * where <timestamp> is the exact `X-Turnkey-Timestamp` header string and <raw_body> is the
 * exact request body bytes (not re-serialized JSON).
 */

/** Exact `X-Turnkey-Timestamp` header value used in the signed message (trimmed only). */
export function turnkeyWebhookSignatureTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp?.trim()) return null
  return timestamp.trim()
}

/** Parse `X-Turnkey-Timestamp` to Unix milliseconds for replay/skew checks only (not for signing). */
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
  /** Exact `X-Turnkey-Timestamp` header string included in the signed prefix. */
  timestampForSigning: string
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
  const timestampForSigning = input.timestampForSigning.trim()
  if (!eventId || !timestampForSigning) return null

  const version = input.signatureVersion?.trim() || "v1"
  const algorithm = input.algorithm?.trim() || "ed25519"
  const signingKeyId = input.signingKeyId?.trim() || "turnkey_webhook_signing_key_001"

  const prefix = `${version}.${algorithm}.${signingKeyId}.${timestampForSigning}.${eventId}.`
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
  const timestampForSigning = input.timestampForSigning.trim()
  if (!eventId || !timestampForSigning) return []

  const timestampMs = parseTurnkeyWebhookTimestampMs(timestampForSigning)
  const timestamps = [timestampForSigning]
  if (timestampMs && timestampMs !== timestampForSigning) {
    timestamps.push(timestampMs)
  }

  const version = (input.signatureVersion?.trim() || "v1").toLowerCase()
  const algorithm = (input.algorithm?.trim() || "ed25519").toLowerCase()
  const signingKeyId = input.signingKeyId?.trim() || "turnkey_webhook_signing_key_001"

  const prefixed = buildTurnkeyWebhookV1SignedMessage(input)
  const candidates: TurnkeyWebhookSignedMessageCandidate[] = []
  if (prefixed) {
    candidates.push({ name: "turnkey-v1-full-prefix", message: prefixed })
  }

  for (const timestamp of timestamps) {
    const suffix = timestamp === timestampForSigning ? "" : "-normalized-ts"
    const stringPrefixes = [
      [`turnkey-v1-full-prefix${suffix}`, `${version}.${algorithm}.${signingKeyId}.${timestamp}.${eventId}.`],
      [`turnkey-v1-no-key${suffix}`, `${version}.${algorithm}.${timestamp}.${eventId}.`],
      [`turnkey-v1-timestamp-event${suffix}`, `${version}.${timestamp}.${eventId}.`],
      [`turnkey-v1-event-timestamp${suffix}`, `${version}.${eventId}.${timestamp}.`],
      [`turnkey-v1-timestamp${suffix}`, `${version}.${timestamp}.`],
      [`svix-style${suffix}`, `${eventId}.${timestamp}.`],
      [`timestamp-event${suffix}`, `${timestamp}.${eventId}.`],
      [`turnkey-key-timestamp-event${suffix}`, `${signingKeyId}.${timestamp}.${eventId}.`],
      [`timestamp-body${suffix}`, `${timestamp}.`],
      [`event-body${suffix}`, `${eventId}.`],
      [`timestamp-pipe-body${suffix}`, `${timestamp}|`],
      [`event-pipe-timestamp-pipe-body${suffix}`, `${eventId}|${timestamp}|`],
      [`timestamp-newline-body${suffix}`, `${timestamp}\n`],
    ] as const

    for (const [name, prefix] of stringPrefixes) {
      if (!suffix && name === "turnkey-v1-full-prefix") continue
      candidates.push({
        name,
        message: Buffer.concat([Buffer.from(prefix, "utf8"), input.rawBody]),
      })
    }

    const concatMessages = [
      [`timestamp-concat-body${suffix}`, timestamp],
      [`event-concat-body${suffix}`, eventId],
      [`event-timestamp-concat-body${suffix}`, `${eventId}${timestamp}`],
      [`timestamp-event-concat-body${suffix}`, `${timestamp}${eventId}`],
    ] as const
    for (const [name, prefix] of concatMessages) {
      candidates.push({
        name,
        message: Buffer.concat([Buffer.from(prefix, "utf8"), input.rawBody]),
      })
    }
  }
  candidates.push({ name: "raw-body", message: input.rawBody })

  return candidates
}
