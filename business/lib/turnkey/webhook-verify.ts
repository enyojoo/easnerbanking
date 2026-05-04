import { createHmac, timingSafeEqual } from "node:crypto"

function timingSafeEqualBuf(a: Buffer, b: Buffer): boolean {
  try {
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Verifies `X-Turnkey-Signature` (or aliases) as HMAC-SHA256 of the raw body with `TURNKEY_WEBHOOK_SECRET`.
 * Accepts digest as lowercase/uppercase hex, optional `sha256=` / `0x` prefixes, or standard/base64url base64.
 */
export function verifyTurnkeyWebhookSignature(rawBody: Buffer, signatureHeader: string | null): boolean {
  const secret = process.env.TURNKEY_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return process.env.NODE_ENV !== "production"
  }
  if (!signatureHeader?.trim()) return false
  let sig = signatureHeader.trim()
  const sha256Eq = /^sha256=/i.exec(sig)
  if (sha256Eq) {
    sig = sig.slice(sha256Eq[0].length).trim()
  }

  const mac = createHmac("sha256", secret).update(rawBody).digest()

  // Hex (optional 0x)
  const hex = sig.replace(/^0x/i, "").trim()
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    try {
      if (timingSafeEqualBuf(Buffer.from(hex, "hex"), mac)) return true
    } catch {
      /* ignore */
    }
  }

  // Base64 / base64url
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
