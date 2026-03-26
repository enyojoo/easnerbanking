import crypto from "crypto"

/** Noah sandbox webhook signing ECDSA public key (see https://docs.noah.com/api-concepts/webhooks/configuration) */
const NOAH_WEBHOOK_PUBLIC_KEY_SANDBOX = `-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEm8yBiD+kmVJ1Xc9sfRkDx0yo9+u8yiADPngI20KoEswz0gflp8o/z66Abqz/m9A1CBecixWdeT72pA8NZBJI6L6Osd8RV+yxQArxeGKEVX/2QNrfPqeAKODHT5LdStGT
-----END PUBLIC KEY-----`

const NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION = `-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAELKJhxcUGJr3XgRrf+laSAVHvp31wFhE2XdicXvF0DAdKzSPN8bkSdjrsUA6nnVUq3M47Y7RUYugMfkagaYjUExQZVjpMFg0PDnXWl9y0dXYD+pzYhAgL+MNpnY0eJ78
-----END PUBLIC KEY-----`

/**
 * Verify Noah webhook `Webhook-Signature` header (base64 ECDSA) over the raw request body bytes.
 */
export function verifyNoahWebhookSignature(rawBody: Buffer, signatureHeader: string | null): boolean {
  if (!signatureHeader?.trim()) return false
  const useProd =
    process.env.NOAH_WEBHOOK_NOAH_ENV === "production" ||
    process.env.NOAH_API_BASE_URL?.includes("api.noah.com")
  const key = useProd ? NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION : NOAH_WEBHOOK_PUBLIC_KEY_SANDBOX
  try {
    const signature = Buffer.from(signatureHeader.trim(), "base64")
    const verifier = crypto.createVerify("SHA384")
    verifier.update(rawBody)
    return verifier.verify(key, signature)
  } catch {
    return false
  }
}
