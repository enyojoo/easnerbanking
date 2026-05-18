import crypto from "crypto"

/** Noah production webhook signing ECDSA public key (see https://docs.noah.com/api-concepts/webhooks/configuration) */
const NOAH_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAELKJhxcUGJr3XgRrf+laSAVHvp31wFhE2XdicXvF0DAdKzSPN8bkSdjrsUA6nnVUq3M47Y7RUYugMfkagaYjUExQZVjpMFg0PDnXWl9y0dXYD+pzYhAgL+MNpnY0eJ78
-----END PUBLIC KEY-----`

/**
 * Verify Noah webhook `Webhook-Signature` header (base64 ECDSA SHA-384) over the raw request body bytes.
 */
export function verifyNoahWebhookSignature(rawBody: Buffer, signatureHeader: string | null): boolean {
  if (!signatureHeader?.trim()) return false
  try {
    const signature = Buffer.from(signatureHeader.trim(), "base64")
    const verifier = crypto.createVerify("SHA384")
    verifier.update(rawBody)
    return verifier.verify(NOAH_WEBHOOK_PUBLIC_KEY, signature)
  } catch {
    return false
  }
}
