import crypto from "node:crypto"
import jwt from "jsonwebtoken"

/**
 * Noah Request Signing — mirrors the official `createJwt` from:
 * https://docs.noah.com/api-concepts/authentication/signing
 *
 * Use the same `body` buffer for the JWT and the HTTP request payload.
 */

export const NOAH_JWT_AUDIENCE = "https://api.noah.com"

export type CreateNoahJwtOptions = {
  body: Buffer | undefined
  method: string
  /** JWT `path` claim, e.g. `/v1/onboarding/:CustomerID` */
  path: string
  /** PEM ES384 private key (secp384r1) */
  privateKey: string
  queryParams?: Record<string, string | number> | undefined
}

/**
 * Creates a JWT for the `Api-Signature` header (Noah docs — ES384, aud, 5m expiry).
 */
export function createNoahSignatureJwt(opts: CreateNoahJwtOptions): string {
  const { body, method, path, privateKey, queryParams } = opts

  let bodyHash: string | undefined
  if (body) {
    bodyHash = crypto.createHash("sha256").update(body).digest("hex")
  }

  const payload = {
    bodyHash,
    method,
    path,
    queryParams,
  }

  return jwt.sign(payload, privateKey, {
    algorithm: "ES384",
    audience: NOAH_JWT_AUDIENCE,
    expiresIn: "5m",
  })
}
