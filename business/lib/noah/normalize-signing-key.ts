import { createPrivateKey, type KeyObject } from "node:crypto"

/**
 * Normalize `NOAH_SIGNING_PRIVATE_KEY` from env (Vercel often stores PEM as one line with `\n`).
 */
export function normalizeNoahSigningPrivateKeyPem(raw: string): string {
  let pem = raw.trim()
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1).trim()
  }

  pem = pem.replace(/\\n/g, "\n").replace(/\r\n/g, "\n")

  if (pem.includes("BEGIN") && !pem.includes("\n")) {
    pem = pem
      .replace(/-----BEGIN ([^-]+)-----/, "-----BEGIN $1-----\n")
      .replace(/\n?-----END ([^-]+)-----/, "\n-----END $1-----")
  }

  return pem.endsWith("\n") ? pem : `${pem}\n`
}

export type NoahSigningKeyMaterial = {
  pem: string
  key: KeyObject
  /** JWS alg that matches the key curve and Noah dashboard registration. */
  algorithm: "ES384" | "ES256"
}

/**
 * Parse and validate the request-signing private key; picks ES384 vs ES256 from the curve.
 */
export function loadNoahSigningKeyMaterial(raw: string): NoahSigningKeyMaterial {
  const pem = normalizeNoahSigningPrivateKeyPem(raw)
  if (!pem.includes("BEGIN") || !pem.includes("PRIVATE KEY")) {
    throw new Error(
      "NOAH_SIGNING_PRIVATE_KEY must be a PEM EC private key (-----BEGIN EC PRIVATE KEY----- or -----BEGIN PRIVATE KEY-----)",
    )
  }

  let key: KeyObject
  try {
    key = createPrivateKey({ key: pem, format: "pem" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `NOAH_SIGNING_PRIVATE_KEY is not a valid PEM private key (${msg}). In Vercel, paste the key with real newlines or use \\n between lines.`,
    )
  }

  if (key.asymmetricKeyType !== "ec") {
    throw new Error("NOAH_SIGNING_PRIVATE_KEY must be an elliptic-curve key for ES384/ES256")
  }

  const curve = key.asymmetricKeyDetails?.namedCurve
  const algorithm: "ES384" | "ES256" =
    curve === "prime256v1" || curve === "secp256r1" ? "ES256" : "ES384"

  return { pem, key, algorithm }
}
