import crypto from "crypto"

/** Noah sandbox webhook ECDSA public key (ES384 / secp384r1). */
export const NOAH_WEBHOOK_PUBLIC_KEY_SANDBOX = `-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEm8yBiD+kmVJ1Xc9sfRkDx0yo9+u8yiADPngI20KoEswz0gflp8o/z66Abqz/m9A1CBecixWdeT72pA8NZBJI6L6Osd8RV+yxQArxeGKEVX/2QNrfPqeAKODHT5LdStGT
-----END PUBLIC KEY-----`

/** Noah production webhook ECDSA public key (ES384 / secp384r1). */
export const NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION = `-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAELKJhxcUGJr3XgRrf+laSAVHvp31wFhE2XdicXvF0DAdKzSPN8bkSdjrsUA6nnVUq3M47Y7RUYugMfkagaYjUExQZVjpMFg0PDnXWl9y0dXYD+pzYhAgL+MNpnY0eJ78
-----END PUBLIC KEY-----`

/**
 * Public keys used to verify Noah `Webhook-Signature` (ECDSA SHA-384 over raw body).
 * @see https://docs.noah.com/api-concepts/webhooks/configuration
 */
export function getNoahWebhookVerifyPublicKeys(): string[] {
  const override = process.env.NOAH_WEBHOOK_PUBLIC_KEY?.trim()
  if (override) return [override]

  const envHint = process.env.NOAH_WEBHOOK_NOAH_ENV?.trim().toLowerCase()
  if (envHint === "sandbox") return [NOAH_WEBHOOK_PUBLIC_KEY_SANDBOX]
  if (envHint === "production" || envHint === "prod") return [NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION]

  // Default: production first, then sandbox (wrong-env signatures still fail both).
  return [NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION, NOAH_WEBHOOK_PUBLIC_KEY_SANDBOX]
}

/** Read signature from Noah / proxy header aliases. */
export function readNoahWebhookSignatureHeader(request: Request): string | null {
  return (
    request.headers.get("Webhook-Signature") ??
    request.headers.get("webhook-signature") ??
    request.headers.get("X-Webhook-Signature") ??
    request.headers.get("x-webhook-signature")
  )
}

function decodeSignatureBytes(signatureHeader: string): Buffer | null {
  const trimmed = signatureHeader.trim()
  if (!trimmed) return null
  try {
    return Buffer.from(trimmed, "base64")
  } catch {
    return null
  }
}

function verifyEcdsaSha384WithKey(
  rawBody: Buffer,
  publicKeyPem: string,
  signature: Buffer,
): boolean {
  const key = crypto.createPublicKey(publicKeyPem)

  try {
    if (crypto.verify("sha384", rawBody, key, signature)) return true
  } catch {
    /* try alternate encoding */
  }

  if (signature.length === 96) {
    try {
      if (
        crypto.verify("sha384", rawBody, { key, dsaEncoding: "ieee-p1363" }, signature)
      ) {
        return true
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const verifier = crypto.createVerify("SHA384")
    verifier.update(rawBody)
    if (verifier.verify(key, signature)) return true
    if (signature.length === 96) {
      const verifierP1363 = crypto.createVerify("SHA384")
      verifierP1363.update(rawBody)
      if (verifierP1363.verify({ key, dsaEncoding: "ieee-p1363" }, signature)) return true
    }
  } catch {
    return false
  }

  return false
}

/**
 * Verify Noah webhook `Webhook-Signature` header (base64 ECDSA SHA-384) over the raw request body bytes.
 */
export function verifyNoahWebhookSignature(rawBody: Buffer, signatureHeader: string | null): boolean {
  if (!signatureHeader?.trim()) return false
  const signature = decodeSignatureBytes(signatureHeader)
  if (!signature?.length) return false

  for (const publicKeyPem of getNoahWebhookVerifyPublicKeys()) {
    try {
      if (verifyEcdsaSha384WithKey(rawBody, publicKeyPem, signature)) return true
    } catch {
      /* invalid PEM in env — try next key */
    }
  }
  return false
}
