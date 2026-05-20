import { createHmac, timingSafeEqual } from "node:crypto"
import type { TurnkeyWebhookSignatureMeta } from "@/lib/turnkey/turnkey-webhook-delivery"

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

/**
 * Verifies `X-Turnkey-Signature` as HMAC-SHA256 of the raw body with `TURNKEY_WEBHOOK_SECRET`.
 * V2 may send `X-Turnkey-Signature-Algorithm` / `Key-Id` — logged on failure for SDK migration.
 */
export function verifyTurnkeyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  meta?: TurnkeyWebhookSignatureMeta,
): boolean {
  const secret = process.env.TURNKEY_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return process.env.NODE_ENV !== "production"
  }
  if (!signatureHeader?.trim()) return false

  if (meta?.algorithm && !isHmacSha256Algorithm(meta.algorithm)) {
    console.warn("[turnkey-webhook] signature algorithm not supported by shared-secret HMAC verifier", {
      algorithm: meta.algorithm,
      keyId: meta.keyId,
      version: meta.version,
    })
    return false
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

  if (meta?.algorithm || meta?.keyId) {
    console.warn("[turnkey-webhook] signature verify failed (V2 metadata present)", {
      algorithm: meta.algorithm,
      keyId: meta.keyId,
      version: meta.version,
    })
  }

  return false
}
