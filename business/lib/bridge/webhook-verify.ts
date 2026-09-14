import crypto from "crypto"
import { getBridgeWebhookPublicKey, getBridgeWebhookSecret } from "./config"

export type BridgeWebhookVerifyFailureCode =
  | "MISSING_SIGNATURE"
  | "INVALID_SIGNATURE"
  | "EMPTY_BODY"
  | "PUBLIC_KEY_MISSING"

export type BridgeWebhookVerifyDiagnostic = {
  ok: boolean
  code?: BridgeWebhookVerifyFailureCode
  bodyBytes: number
}

export function normalizeBridgeWebhookPublicKeyPem(pem: string): string {
  const unescaped = pem.trim().replace(/\\n/g, "\n")
  if (unescaped.includes("BEGIN PUBLIC KEY")) return unescaped
  return `-----BEGIN PUBLIC KEY-----\n${unescaped}\n-----END PUBLIC KEY-----`
}

export function readBridgeWebhookSignatureHeader(request: Request): string | null {
  return (
    request.headers.get("X-Webhook-Signature")?.trim() ||
    request.headers.get("x-webhook-signature")?.trim() ||
    null
  )
}

function parseTimestampAndSignature(header: string): { timestamp: string; signature: string } | null {
  const parts = header.split(",").map((p) => p.trim())
  let timestamp = ""
  let signature = ""
  for (const part of parts) {
    const [k, ...rest] = part.split("=")
    const v = rest.join("=")
    if (k === "t") timestamp = v
    if (k === "v0" || k === "v1" || k === "s") signature = v
  }
  if (signature) return { timestamp, signature }
  if (header && !header.includes("=")) return { timestamp: "", signature: header }
  return null
}

export function diagnoseBridgeWebhookVerification(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  publicKeyPem?: string | null,
  hmacSecret?: string | null,
): BridgeWebhookVerifyDiagnostic {
  const bodyBytes = rawBody.byteLength
  if (bodyBytes === 0) return { ok: false, code: "EMPTY_BODY", bodyBytes }
  const header = String(signatureHeader ?? "").trim()
  if (!header) return { ok: false, code: "MISSING_SIGNATURE", bodyBytes }

  const parsed = parseTimestampAndSignature(header)
  if (!parsed) return { ok: false, code: "INVALID_SIGNATURE", bodyBytes }

  const payload = parsed.timestamp
    ? Buffer.concat([Buffer.from(`${parsed.timestamp}.`, "utf8"), rawBody])
    : rawBody

  const pem = publicKeyPem ?? getBridgeWebhookPublicKey()
  if (pem) {
    try {
      const ok = crypto.verify(
        "sha256",
        payload,
        { key: normalizeBridgeWebhookPublicKeyPem(pem) },
        Buffer.from(parsed.signature, "base64"),
      )
      return ok ? { ok: true, bodyBytes } : { ok: false, code: "INVALID_SIGNATURE", bodyBytes }
    } catch {
      return { ok: false, code: "INVALID_SIGNATURE", bodyBytes }
    }
  }

  const secret = hmacSecret ?? getBridgeWebhookSecret()
  if (!secret) return { ok: false, code: "PUBLIC_KEY_MISSING", bodyBytes }

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex")
  const given = parsed.signature.replace(/^sha256=/i, "")
  const a = Buffer.from(expected, "hex")
  const b = Buffer.from(given, "hex")
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const expectedB64 = crypto.createHmac("sha256", secret).update(payload).digest("base64")
    if (expectedB64 !== given) {
      return { ok: false, code: "INVALID_SIGNATURE", bodyBytes }
    }
  }
  return { ok: true, bodyBytes }
}

export function verifyBridgeWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
): boolean {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody
  return diagnoseBridgeWebhookVerification(body, signatureHeader).ok
}
