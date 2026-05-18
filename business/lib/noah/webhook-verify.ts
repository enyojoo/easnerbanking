import crypto from "crypto"

/** Noah sandbox webhook ECDSA public key (ES384 / secp384r1). */
export const NOAH_WEBHOOK_PUBLIC_KEY_SANDBOX = `-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEm8yBiD+kmVJ1Xc9sfRkDx0yo9+u8yiADPngI20KoEswz0gflp8o/z66Abqz/m9A1CBecixWdeT72pA8NZBJI6L6Osd8RV+yxQArxeGKEVX/2QNrfPqeAKODHT5LdStGT
-----END PUBLIC KEY-----`

/** Noah production webhook ECDSA public key (ES384 / secp384r1). */
export const NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION = `-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAELKJhxcUGJr3XgRrf+laSAVHvp31wFhE2XdicXvF0DAdKzSPN8bkSdjrsUA6nnVUq3M47Y7RUYugMfkagaYjUExQZVjpMFg0PDnXWl9y0dXYD+pzYhAgL+MNpnY0eJ78
-----END PUBLIC KEY-----`

export type NoahWebhookVerifyFailureCode = "MISSING_SIGNATURE" | "INVALID_SIGNATURE" | "EMPTY_BODY"

export type NoahWebhookVerifyDiagnostic = {
  ok: boolean
  code?: NoahWebhookVerifyFailureCode
  bodyBytes: number
  signatureCandidates: number
  signatureBytes: number | null
  keysTried: number
  allowUnsigned: boolean
}

/**
 * Public keys used to verify Noah `Webhook-Signature` (ECDSA SHA-384 over raw body).
 * @see https://docs.noah.com/api-concepts/webhooks/configuration
 */
export function getNoahWebhookVerifyPublicKeys(): string[] {
  const override = process.env.NOAH_WEBHOOK_PUBLIC_KEY?.trim()
  if (override) return [normalizeWebhookPublicKeyPem(override)]

  const envHint = process.env.NOAH_WEBHOOK_NOAH_ENV?.trim().toLowerCase()
  if (envHint === "sandbox") return [NOAH_WEBHOOK_PUBLIC_KEY_SANDBOX]
  if (envHint === "production" || envHint === "prod") return [NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION]

  return [NOAH_WEBHOOK_PUBLIC_KEY_PRODUCTION, NOAH_WEBHOOK_PUBLIC_KEY_SANDBOX]
}

function normalizeWebhookPublicKeyPem(pem: string): string {
  const trimmed = pem.trim()
  if (trimmed.includes("BEGIN PUBLIC KEY")) return trimmed
  return `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----`
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

/** Split combined header values (some senders append multiple signatures). */
export function splitWebhookSignatureHeader(signatureHeader: string): string[] {
  const trimmed = signatureHeader.trim()
  if (!trimmed) return []
  if (!trimmed.includes(",")) return [trimmed]
  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

function decodeSignatureBytes(candidate: string): Buffer | null {
  let value = candidate.trim()
  if (!value) return null

  const shaPrefix = /^sha384=/i.exec(value)
  if (shaPrefix) value = value.slice(shaPrefix[0].length).trim()

  try {
    const norm = value.replace(/-/g, "+").replace(/_/g, "/")
    const padLen = (4 - (norm.length % 4)) % 4
    const padded = norm + "=".repeat(padLen)
    const buf = Buffer.from(padded, "base64")
    if (buf.length > 0) return buf
  } catch {
    /* try hex */
  }

  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    try {
      return Buffer.from(value, "hex")
    } catch {
      return null
    }
  }

  return null
}

/**
 * Noah docs Node.js pattern — primary verifier.
 * @see https://docs.noah.com/api-concepts/webhooks/configuration
 */
function verifyWithNoahDocsNodePattern(
  rawBody: Buffer,
  publicKeyPem: string,
  signature: Buffer,
): boolean {
  const verifier = crypto.createVerify("SHA384")
  verifier.update(rawBody)
  return verifier.verify(publicKeyPem, signature)
}

/** Go docs pattern — SHA-384 hash of body, then ASN.1 ECDSA verify. */
function verifyWithNoahDocsGoPattern(
  rawBody: Buffer,
  publicKeyPem: string,
  signature: Buffer,
): boolean {
  const key = crypto.createPublicKey(publicKeyPem)
  const hash = crypto.createHash("sha384").update(rawBody).digest()
  try {
    return crypto.verify(null, hash, key, signature)
  } catch {
    return false
  }
}

function verifyEcdsaSha384WithKey(
  rawBody: Buffer,
  publicKeyPem: string,
  signature: Buffer,
): boolean {
  if (verifyWithNoahDocsNodePattern(rawBody, publicKeyPem, signature)) return true
  if (verifyWithNoahDocsGoPattern(rawBody, publicKeyPem, signature)) return true

  const key = crypto.createPublicKey(publicKeyPem)
  try {
    if (crypto.verify("sha384", rawBody, key, signature)) return true
  } catch {
    /* alternate encoding */
  }

  if (signature.length === 96) {
    try {
      if (crypto.verify("sha384", rawBody, { key, dsaEncoding: "ieee-p1363" }, signature)) {
        return true
      }
    } catch {
      /* fall through */
    }
  }

  return false
}

function isWebhookUnsignedAllowed(): boolean {
  return (
    process.env.NOAH_WEBHOOK_ALLOW_UNSIGNED === "true" ||
    process.env.NOAH_WEBHOOK_ALLOW_UNSIGNED === "1"
  )
}

/**
 * Verify Noah webhook `Webhook-Signature` header (base64 ECDSA SHA-384) over the raw request body bytes.
 */
export function verifyNoahWebhookSignature(rawBody: Buffer, signatureHeader: string | null): boolean {
  return diagnoseNoahWebhookVerification(rawBody, signatureHeader).ok
}

export function diagnoseNoahWebhookVerification(
  rawBody: Buffer,
  signatureHeader: string | null,
): NoahWebhookVerifyDiagnostic {
  const allowUnsigned = isWebhookUnsignedAllowed()
  const bodyBytes = rawBody.length

  if (bodyBytes === 0 && !allowUnsigned) {
    return {
      ok: false,
      code: "EMPTY_BODY",
      bodyBytes,
      signatureCandidates: 0,
      signatureBytes: null,
      keysTried: 0,
      allowUnsigned,
    }
  }

  if (!signatureHeader?.trim()) {
    if (allowUnsigned && bodyBytes > 0) {
      return {
        ok: true,
        bodyBytes,
        signatureCandidates: 0,
        signatureBytes: null,
        keysTried: 0,
        allowUnsigned,
      }
    }
    return {
      ok: false,
      code: "MISSING_SIGNATURE",
      bodyBytes,
      signatureCandidates: 0,
      signatureBytes: null,
      keysTried: 0,
      allowUnsigned,
    }
  }

  const candidates = splitWebhookSignatureHeader(signatureHeader)
  const keys = getNoahWebhookVerifyPublicKeys()

  for (const candidate of candidates) {
    const signature = decodeSignatureBytes(candidate)
    if (!signature?.length) continue

    for (const publicKeyPem of keys) {
      try {
        if (verifyEcdsaSha384WithKey(rawBody, publicKeyPem, signature)) {
          return {
            ok: true,
            bodyBytes,
            signatureCandidates: candidates.length,
            signatureBytes: signature.length,
            keysTried: keys.length,
            allowUnsigned,
          }
        }
      } catch {
        /* invalid PEM in env — try next key */
      }
    }
  }

  return {
    ok: false,
    code: "INVALID_SIGNATURE",
    bodyBytes,
    signatureCandidates: candidates.length,
    signatureBytes: candidates.length
      ? decodeSignatureBytes(candidates[0]!)?.length ?? null
      : null,
    keysTried: keys.length,
    allowUnsigned,
  }
}
