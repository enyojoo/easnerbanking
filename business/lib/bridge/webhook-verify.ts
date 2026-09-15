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

/** Vercel often stores PEMs with `\n`, CRLF, or a `KEY=` prefix in the value. */
export function normalizeBridgeWebhookPublicKeyPem(pem: string): string {
  let raw = pem.trim()
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1).trim()
  }
  raw = raw.replace(/^BRIDGE_WEBHOOK_PUBLIC_KEY\s*=\s*/i, "").trim()
  raw = raw.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  const b64 = raw
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "")
  if (!b64) return raw
  const lines = b64.match(/.{1,64}/g) ?? [b64]
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`
}

export function readBridgeWebhookSignatureHeader(request: Request): string | null {
  return (
    request.headers.get("X-Webhook-Signature")?.trim() ||
    request.headers.get("x-webhook-signature")?.trim() ||
    null
  )
}

function verifyRsaSha256(key: string, data: Buffer, signature: Buffer): boolean {
  try {
    return crypto.verify("sha256", data, { key }, signature)
  } catch {
    return false
  }
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

  const signedBytes = parsed.timestamp
    ? Buffer.concat([Buffer.from(`${parsed.timestamp}.`, "utf8"), rawBody])
    : rawBody

  const pem = publicKeyPem ?? getBridgeWebhookPublicKey()
  if (pem) {
    const key = normalizeBridgeWebhookPublicKeyPem(pem)
    const signature = Buffer.from(parsed.signature, "base64")
    // Bridge signs SHA256(`${t}.${rawBody}`), then RSA-SHA256 over that digest.
    // https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-webhooks
    const digest = crypto.createHash("sha256").update(signedBytes).digest()
    const official = verifyRsaSha256(key, digest, signature)
    const singleHash = official ? true : verifyRsaSha256(key, signedBytes, signature)
    return official || singleHash
      ? { ok: true, bodyBytes }
      : { ok: false, code: "INVALID_SIGNATURE", bodyBytes }
  }

  const secret = hmacSecret ?? getBridgeWebhookSecret()
  if (!secret) return { ok: false, code: "PUBLIC_KEY_MISSING", bodyBytes }

  const expected = crypto.createHmac("sha256", secret).update(signedBytes).digest("hex")
  const given = parsed.signature.replace(/^sha256=/i, "")
  const a = Buffer.from(expected, "hex")
  const b = Buffer.from(given, "hex")
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const expectedB64 = crypto.createHmac("sha256", secret).update(signedBytes).digest("base64")
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
