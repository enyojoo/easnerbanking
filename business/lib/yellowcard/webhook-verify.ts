import { createHmac, timingSafeEqual } from "crypto"
import { getYellowcardApiSecret } from "./config"

/**
 * Yellowcard webhook signature: base64(HMAC-SHA256(rawBody, apiSecret)) in `X-YC-Signature`.
 * Distinct from API request auth (`YcHmacV1`).
 */
export function readYellowcardWebhookSignatureHeader(request: Request): string | null {
  return (
    request.headers.get("x-yc-signature")?.trim() ||
    request.headers.get("X-YC-Signature")?.trim() ||
    null
  )
}

export function computeYellowcardWebhookSignature(
  rawBody: Buffer | string,
  apiSecret?: string,
): string {
  const secret = apiSecret ?? getYellowcardApiSecret()
  if (!secret) {
    throw new Error("YELLOWCARD_API_SECRET is required for webhook verification")
  }
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody
  return createHmac("sha256", secret).update(body).digest("base64")
}

export function verifyYellowcardWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
  apiSecret?: string,
): boolean {
  if (!signatureHeader?.trim()) return false
  let expected: string
  try {
    expected = computeYellowcardWebhookSignature(rawBody, apiSecret)
  } catch {
    return false
  }
  const provided = signatureHeader.trim()
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export type YellowcardWebhookVerifyDiagnostic = {
  ok: boolean
  code?: "MISSING_SIGNATURE" | "EMPTY_BODY" | "INVALID_SIGNATURE" | "SECRET_MISSING"
  bodyBytes: number
}

export function diagnoseYellowcardWebhookVerification(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  apiSecret?: string,
): YellowcardWebhookVerifyDiagnostic {
  const bodyBytes = rawBody.byteLength
  if (bodyBytes === 0) {
    return { ok: false, code: "EMPTY_BODY", bodyBytes }
  }
  const secret = apiSecret ?? getYellowcardApiSecret()
  if (!secret) {
    return { ok: false, code: "SECRET_MISSING", bodyBytes }
  }
  if (!signatureHeader?.trim()) {
    return { ok: false, code: "MISSING_SIGNATURE", bodyBytes }
  }
  if (!verifyYellowcardWebhookSignature(rawBody, signatureHeader, secret)) {
    return { ok: false, code: "INVALID_SIGNATURE", bodyBytes }
  }
  return { ok: true, bodyBytes }
}
