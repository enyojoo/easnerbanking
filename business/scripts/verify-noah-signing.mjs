#!/usr/bin/env node
/**
 * Verify NOAH_SIGNING_PRIVATE_KEY matches Noah docs (ES384 / secp384r1).
 * https://docs.noah.com/api-concepts/authentication/signing
 *
 *   export NOAH_SIGNING_PRIVATE_KEY="$(cat private-key.pem)"
 *   node business/scripts/verify-noah-signing.mjs
 */
import { createPrivateKey, createPublicKey } from "node:crypto"

function normalizePem(raw) {
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

const raw = process.env.NOAH_SIGNING_PRIVATE_KEY?.trim() || ""
if (!raw) {
  console.error("Missing NOAH_SIGNING_PRIVATE_KEY")
  process.exit(1)
}

try {
  const pem = normalizePem(raw)
  const key = createPrivateKey({ key: pem, format: "pem" })
  const curve = key.asymmetricKeyDetails?.namedCurve
  if (curve !== "secp384r1") {
    console.error(`Expected secp384r1 (ES384), got ${curve ?? "unknown"}`)
    console.error("Generate: openssl ecparam -name secp384r1 -genkey -noout -out private-key.pem")
    process.exit(1)
  }
  const publicPem = createPublicKey(key).export({ type: "spki", format: "pem" })
  console.log("OK – ES384 / secp384r1")
  console.log("\nUpload this public key on your production Noah API key:\n")
  console.log(publicPem)
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
