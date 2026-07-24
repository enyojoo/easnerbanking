import crypto from "crypto"
import { getGridWebhookPublicKey } from "./config"

export type GridWebhookVerifyFailureCode =
  | "MISSING_SIGNATURE"
  | "INVALID_SIGNATURE"
  | "EMPTY_BODY"
  | "PUBLIC_KEY_MISSING"

export type GridWebhookVerifyDiagnostic = {
  ok: boolean
  code?: GridWebhookVerifyFailureCode
  bodyBytes: number
}

/** Normalize PEM from env (supports literal `\n` sequences). */
export function normalizeGridWebhookPublicKeyPem(pem: string): string {
  const unescaped = pem.trim().replace(/\\n/g, "\n")
  if (unescaped.includes("BEGIN PUBLIC KEY")) return unescaped
  return `-----BEGIN PUBLIC KEY-----\n${unescaped}\n-----END PUBLIC KEY-----`
}

/**
 * Grid sends signatures in `X-Grid-Signature`.
 * @see https://docs.lightspark.com/payouts-and-b2b/webhooks
 */
export function readGridWebhookSignatureHeader(request: Request): string | null {
  return (
    request.headers.get("X-Grid-Signature")?.trim() ||
    request.headers.get("x-grid-signature")?.trim() ||
    null
  )
}

/** Parse `{"v":"1","s":"base64..."}` or raw base64 signature bytes. */
export function parseGridSignatureBytes(signatureHeader: string): Buffer | null {
  const trimmed = signatureHeader.trim()
  if (!trimmed) return null

  try {
    const signatureObj = JSON.parse(trimmed) as { v?: string; s?: string }
    if (signatureObj.v && signatureObj.s) {
      return Buffer.from(signatureObj.s, "base64")
    }
  } catch {
    /* direct base64 */
  }

  try {
    const buf = Buffer.from(trimmed, "base64")
    return buf.length > 0 ? buf : null
  } catch {
    return null
  }
}

/**
 * Verify Grid webhook signature (ECDSA SHA-256 over raw body, SPKI public key).
 * Matches Lightspark Node.js docs pattern.
 */
export function verifyGridWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
  publicKeyPem?: string,
): boolean {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody
  return diagnoseGridWebhookVerification(body, signatureHeader, publicKeyPem).ok
}

export function diagnoseGridWebhookVerification(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  publicKeyPem?: string,
): GridWebhookVerifyDiagnostic {
  const bodyBytes = rawBody.byteLength
  if (bodyBytes === 0) {
    return { ok: false, code: "EMPTY_BODY", bodyBytes }
  }

  const pem = publicKeyPem ?? getGridWebhookPublicKey()
  if (!pem) {
    return { ok: false, code: "PUBLIC_KEY_MISSING", bodyBytes }
  }

  if (!signatureHeader?.trim()) {
    return { ok: false, code: "MISSING_SIGNATURE", bodyBytes }
  }

  const signature = parseGridSignatureBytes(signatureHeader)
  if (!signature?.length) {
    return { ok: false, code: "INVALID_SIGNATURE", bodyBytes }
  }

  try {
    const verifier = crypto.createVerify("SHA256")
    verifier.update(rawBody)
    verifier.end()

    const isValid = verifier.verify(
      {
        key: pem,
        format: "pem",
        type: "spki",
      },
      signature,
    )

    if (!isValid) {
      return { ok: false, code: "INVALID_SIGNATURE", bodyBytes }
    }
    return { ok: true, bodyBytes }
  } catch {
    return { ok: false, code: "INVALID_SIGNATURE", bodyBytes }
  }
}
