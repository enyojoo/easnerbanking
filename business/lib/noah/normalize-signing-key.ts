import { createPrivateKey } from "node:crypto"

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

/**
 * Validate PEM and require secp384r1 (ES384) per Noah key generation:
 * openssl ecparam -name secp384r1 -genkey -noout -out private-key.pem
 */
export function assertNoahEs384SigningPrivateKeyPem(raw: string): string {
  const pem = normalizeNoahSigningPrivateKeyPem(raw)
  if (!pem.includes("BEGIN") || !pem.includes("PRIVATE KEY")) {
    throw new Error(
      "NOAH_SIGNING_PRIVATE_KEY must be a PEM EC private key (-----BEGIN EC PRIVATE KEY----- or -----BEGIN PRIVATE KEY-----)",
    )
  }

  let key
  try {
    key = createPrivateKey({ key: pem, format: "pem" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `NOAH_SIGNING_PRIVATE_KEY is not a valid PEM private key (${msg}). In Vercel, paste the key with real newlines or use \\n between lines.`,
    )
  }

  if (key.asymmetricKeyType !== "ec") {
    throw new Error("NOAH_SIGNING_PRIVATE_KEY must be an elliptic-curve key (ES384 / secp384r1)")
  }

  const curve = key.asymmetricKeyDetails?.namedCurve
  if (curve !== "secp384r1") {
    throw new Error(
      `NOAH_SIGNING_PRIVATE_KEY must use curve secp384r1 (ES384) per Noah docs; got ${curve ?? "unknown"}. Generate with: openssl ecparam -name secp384r1 -genkey -noout -out private-key.pem && openssl ec -in private-key.pem -pubout -out public-key.pem`,
    )
  }

  return pem
}

/** @deprecated Use assertNoahEs384SigningPrivateKeyPem */
export function loadNoahSigningKeyMaterial(raw: string) {
  const pem = assertNoahEs384SigningPrivateKeyPem(raw)
  const key = createPrivateKey({ key: pem, format: "pem" })
  return { pem, key, algorithm: "ES384" as const }
}
