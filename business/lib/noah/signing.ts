import crypto from "node:crypto"
import jwt from "jsonwebtoken"
import { loadNoahSigningKeyMaterial } from "./normalize-signing-key"

/** Noah verifies `aud` as this value in production. @see Noah signing docs */
const NOAH_AUDIENCE = "https://api.noah.com"

export function createNoahSignatureJwt(input: {
  method: string
  /** Signed path including `/v1`, e.g. `/v1/onboarding/:CustomerID` */
  path: string
  queryParams?: Record<string, string | number | boolean | undefined>
  body?: Buffer
  privateKeyPem: string
}): string {
  const { key, algorithm } = loadNoahSigningKeyMaterial(input.privateKeyPem)

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

  return jwt.sign(payload, key, {
    algorithm,
    audience: NOAH_AUDIENCE,
    expiresIn: "5m",
  })
}
