import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Verifies `X-Turnkey-Signature` = HMAC-SHA256(hex) of raw body with `TURNKEY_WEBHOOK_SECRET`.
 * Align secret format with your Turnkey / gateway configuration.
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

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  try {
    const a = Buffer.from(sig, "hex")
    const b = Buffer.from(expected, "hex")
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
