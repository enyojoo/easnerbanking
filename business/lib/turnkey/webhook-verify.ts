import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { TurnkeyWebhookHeaders } from "@/lib/turnkey/turnkey-webhook-delivery"
import type { TurnkeyWebhookSignatureMeta } from "@/lib/turnkey/turnkey-webhook-delivery"
import {
  turnkeyWebhookEd25519FailureDiagnostics,
  verifyTurnkeyCanonicalEd25519Noble,
  verifyTurnkeyWebhookEd25519Noble,
} from "@/lib/turnkey/turnkey-webhook-ed25519-verify"
import {
  buildTurnkeyWebhookV1SignedMessage,
  buildTurnkeyWebhookV1SignedMessageCandidates,
  turnkeyWebhookSignatureTimestamp,
} from "@/lib/turnkey/turnkey-webhook-signed-payload"
import {
  resolveTurnkeyWebhookEd25519PublicKey,
  turnkeyWebhookSigningPublicKeyFingerprint,
} from "@/lib/turnkey/turnkey-webhook-signing-keys"

export type TurnkeyWebhookVerifyInput = {
  rawBody: Buffer
  signatureHeader: string | null
  meta?: TurnkeyWebhookSignatureMeta
  /** V2 delivery headers used to build the signed payload string. */
  eventId?: string | null
  timestamp?: string | null
}

function timingSafeEqualBuf(a: Buffer, b: Buffer): boolean {
  try {
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function isHmacSha256Algorithm(algorithm: string | null | undefined): boolean {
  if (!algorithm?.trim()) return true
  const a = algorithm.trim().toLowerCase()
  return a.includes("hmac") || a.includes("sha256") || a === "hs256"
}

function isEd25519Algorithm(algorithm: string | null | undefined): boolean {
  if (!algorithm?.trim()) return false
  const a = algorithm.trim().toLowerCase()
  return a.includes("ed25519") || a === "eddsa" || a.includes("eddsa")
}

/** Turnkey V2 sends hex-encoded Ed25519 signatures in `X-Turnkey-Signature`. */
function decodeEd25519SignatureBytes(signatureHeader: string): Buffer[] {
  const out: Buffer[] = []
  const raw = signatureHeader.trim()
  if (!raw) return out

  const parts = [raw]
  for (const part of raw.split(/[,\s]+/)) {
    const trimmed = part.trim()
    if (trimmed) parts.push(trimmed)
    const kv = /^v\d+=(.+)$/i.exec(trimmed) || /^signature=(.+)$/i.exec(trimmed)
    if (kv?.[1]) parts.push(kv[1].trim())
  }

  for (let part of parts) {
    const v1 = /^v1[=:,]/i.exec(part)
    if (v1) part = part.slice(v1[0].length).trim()

    const hex = part.replace(/^0x/i, "").trim()
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length === 128) {
      try {
        const buf = Buffer.from(hex, "hex")
        if (!out.some((existing) => existing.equals(buf))) out.push(buf)
      } catch {
        /* ignore */
      }
    }

    // Legacy / mistaken encodings
    try {
      const norm = part.replace(/-/g, "+").replace(/_/g, "/")
      const padLen = (4 - (norm.length % 4)) % 4
      const buf = Buffer.from(norm + "=".repeat(padLen), "base64")
      if (buf.length === 64 && !out.some((existing) => existing.equals(buf))) out.push(buf)
    } catch {
      /* ignore */
    }
  }

  return out
}

function verifyEd25519TurnkeyWebhook(input: TurnkeyWebhookVerifyInput): boolean {
  const sigHeader = input.signatureHeader?.trim()
  if (!sigHeader) return false

  const keyMaterial = resolveTurnkeyWebhookEd25519PublicKey(input.meta?.keyId)
  if (!keyMaterial) {
    console.warn("[turnkey-webhook] ed25519 signature present but no public key configured", {
      keyId: input.meta?.keyId ?? "turnkey_webhook_signing_key_001",
      hint: "Set TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY or TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEYS_JSON (hex/base64/PEM). Request key from Turnkey support if needed.",
    })
    return false
  }

  const signatures = decodeEd25519SignatureBytes(sigHeader)
  if (!signatures.length) {
    console.warn("[turnkey-webhook] could not decode ed25519 signature bytes", {
      keyId: input.meta?.keyId,
    })
    return false
  }

  const eventId = input.eventId?.trim()
  const timestampForSigning = turnkeyWebhookSignatureTimestamp(input.timestamp)
  if (!eventId || !timestampForSigning) {
    console.warn("[turnkey-webhook] ed25519 verify requires X-Turnkey-Event-Id and X-Turnkey-Timestamp", {
      hasEventId: Boolean(eventId),
      hasTimestamp: Boolean(input.timestamp),
    })
    return false
  }

  const canonicalInput = {
    rawBody: input.rawBody,
    eventId,
    timestampForSigning,
    signingKeyId: input.meta?.keyId,
    signatureVersion: input.meta?.version,
    algorithm: input.meta?.algorithm,
  }
  const strictSignature = process.env.TURNKEY_WEBHOOK_STRICT_SIGNATURE === "true"
  const publicKey32 = keyMaterial.publicKey

  const canonicalSignedInput = buildTurnkeyWebhookV1SignedMessage(canonicalInput)
  if (canonicalSignedInput) {
    for (const sig of signatures) {
      if (verifyTurnkeyCanonicalEd25519Noble(canonicalSignedInput, sig, publicKey32)) {
        return true
      }
    }
  }

  if (
    verifyTurnkeyWebhookEd25519Noble(
      {
        version: canonicalInput.signatureVersion?.trim() || "v1",
        algorithm: canonicalInput.algorithm?.trim() || "ed25519",
        keyId: canonicalInput.signingKeyId?.trim() || "turnkey_webhook_signing_key_001",
        timestamp: timestampForSigning,
        eventId,
        signatureHex: sigHeader,
      },
      input.rawBody,
      publicKey32,
    )
  ) {
    return true
  }

  const messages = strictSignature ? [] : buildTurnkeyWebhookV1SignedMessageCandidates(canonicalInput)
  for (const sig of signatures) {
    for (const candidate of messages) {
      if (verifyTurnkeyCanonicalEd25519Noble(candidate.message, sig, publicKey32)) {
        console.info("[turnkey-webhook] ed25519 signature verified with compatibility payload", {
          keyId: input.meta?.keyId,
          algorithm: input.meta?.algorithm,
          version: input.meta?.version,
          signedPayload: candidate.name,
        })
        return true
      }
    }
  }

  const logFailure = strictSignature ? console.warn : console.info
  const diagnostics = turnkeyWebhookEd25519FailureDiagnostics(canonicalInput, input.rawBody)
  logFailure("[turnkey-webhook] ed25519 signature verify failed", {
    keyId: input.meta?.keyId,
    algorithm: input.meta?.algorithm,
    version: input.meta?.version,
    publicKeySource: keyMaterial.source,
    publicKeyFingerprint: turnkeyWebhookSigningPublicKeyFingerprint(keyMaterial.publicKey),
    eventId,
    timestampForSigning,
    strictSignature,
    signatureCandidates: signatures.length,
    signedPayloadCandidates: messages.map((m) => m.name),
    ...diagnostics,
    ...(strictSignature
      ? {
          hint: "Unset TURNKEY_WEBHOOK_STRICT_SIGNATURE in Vercel to restore compatibility mode until Turnkey confirms raw body bytes.",
        }
      : {}),
  })
  return false
}

function verifyHmacTurnkeyWebhook(rawBody: Buffer, signatureHeader: string): boolean {
  const secret = process.env.TURNKEY_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return process.env.NODE_ENV !== "production"
  }

  let sig = signatureHeader.trim()
  const sha256Eq = /^sha256=/i.exec(sig)
  if (sha256Eq) {
    sig = sig.slice(sha256Eq[0].length).trim()
  }

  const mac = createHmac("sha256", secret).update(rawBody).digest()

  const hex = sig.replace(/^0x/i, "").trim()
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    try {
      if (timingSafeEqualBuf(Buffer.from(hex, "hex"), mac)) return true
    } catch {
      /* ignore */
    }
  }

  try {
    const norm = sig.replace(/-/g, "+").replace(/_/g, "/")
    const padLen = (4 - (norm.length % 4)) % 4
    const padded = norm + "=".repeat(padLen)
    if (timingSafeEqualBuf(Buffer.from(padded, "base64"), mac)) return true
  } catch {
    /* ignore */
  }

  return false
}

/**
 * Verifies Turnkey webhook `X-Turnkey-Signature`.
 * - Legacy / org-feature: HMAC-SHA256 of raw body (`TURNKEY_WEBHOOK_SECRET`).
 * - Webhooks V2: Ed25519 over `v1.ed25519.<keyId>.<timestampMs>.<eventId>.<rawBody>` per Turnkey docs.
 */
export function verifyTurnkeyWebhookSignature(
  rawBodyOrInput: Buffer | TurnkeyWebhookVerifyInput,
  signatureHeader?: string | null,
  meta?: TurnkeyWebhookSignatureMeta,
): boolean {
  const input: TurnkeyWebhookVerifyInput =
    Buffer.isBuffer(rawBodyOrInput) ?
      {
        rawBody: rawBodyOrInput,
        signatureHeader: signatureHeader ?? null,
        meta,
      }
    : rawBodyOrInput

  if (!input.signatureHeader?.trim()) return false

  const useEd25519 =
    isEd25519Algorithm(input.meta?.algorithm) ||
    (input.meta?.version?.trim().toLowerCase() === "v1" &&
      input.meta?.keyId?.trim() &&
      !isHmacSha256Algorithm(input.meta?.algorithm))

  if (useEd25519) {
    return verifyEd25519TurnkeyWebhook(input)
  }

  if (input.meta?.algorithm && !isHmacSha256Algorithm(input.meta.algorithm)) {
    console.warn("[turnkey-webhook] unknown signature algorithm", {
      algorithm: input.meta.algorithm,
      keyId: input.meta.keyId,
      version: input.meta.version,
    })
    return false
  }

  const ok = verifyHmacTurnkeyWebhook(input.rawBody, input.signatureHeader)
  if (!ok && (input.meta?.algorithm || input.meta?.keyId)) {
    console.warn("[turnkey-webhook] HMAC signature verify failed (V2 metadata present)", {
      algorithm: input.meta?.algorithm,
      keyId: input.meta?.keyId,
      version: input.meta?.version,
    })
  }
  return ok
}

/** Convenience: build verify input from parsed V2 headers. */
export function turnkeyWebhookVerifyInputFromHeaders(
  rawBody: Buffer,
  headers: TurnkeyWebhookHeaders,
  meta: TurnkeyWebhookSignatureMeta,
): TurnkeyWebhookVerifyInput {
  return {
    rawBody,
    signatureHeader: headers.signature,
    meta,
    eventId: headers.eventId,
    timestamp: headers.timestamp,
  }
}
