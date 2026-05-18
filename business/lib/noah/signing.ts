import crypto from "node:crypto"
import jwt from "jsonwebtoken"

/** Noah verifies `aud` as this value in production. @see Noah signing docs */
const NOAH_AUDIENCE = "https://api.noah.com"

export function createNoahSignatureJwt(input: {
  method: string
  /** URL pathname including /v1 prefix, e.g. /v1/customers/abc */
  path: string
  queryParams?: Record<string, string | number | boolean | undefined>
  body?: Buffer
  privateKeyPem: string
}): string {
  let bodyHash: string | undefined
  if (input.body && input.body.length > 0) {
    bodyHash = crypto.createHash("sha256").update(input.body).digest("hex")
  }

  const payload: Record<string, unknown> = {
    method: input.method.toUpperCase(),
    path: input.path,
  }

  if (input.queryParams && Object.keys(input.queryParams).length > 0) {
    const cleaned: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(input.queryParams)) {
      if (v === undefined) continue
      cleaned[k] = v as string | number
    }
    if (Object.keys(cleaned).length > 0) {
      payload.queryParams = cleaned
    }
  }

  if (bodyHash) {
    payload.bodyHash = bodyHash
  }

  return jwt.sign(payload, input.privateKeyPem, {
    algorithm: "ES384",
    audience: NOAH_AUDIENCE,
    expiresIn: "5m",
  })
}
