import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

export const KYB_PII_KEY_ID = "kyb-pii-v1"

function kybPiiKey(): Buffer {
  const configured =
    process.env.KYB_PII_ENCRYPTION_KEY?.trim() ||
    process.env.PAYROLL_DATA_ENCRYPTION_KEY?.trim() ||
    process.env.GRID_CLIENT_SECRET?.trim()
  if (!configured) {
    throw new Error("KYB_PII_ENCRYPTION_KEY is required to store KYB identifiers")
  }
  return createHash("sha256").update(configured, "utf8").digest()
}

export function encryptKybPii(value: string | null | undefined): {
  ciphertext: string | null
  keyId: string | null
} {
  const plain = String(value ?? "").trim()
  if (!plain) return { ciphertext: null, keyId: null }
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", kybPiiKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`,
    keyId: KYB_PII_KEY_ID,
  }
}

export function decryptKybPii(ciphertext: string | null | undefined): string {
  const raw = String(ciphertext ?? "").trim()
  if (!raw) return ""
  const [version, ivValue, tagValue, encryptedValue] = raw.split(".")
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported KYB identifier ciphertext")
  }
  const decipher = createDecipheriv("aes-256-gcm", kybPiiKey(), Buffer.from(ivValue, "base64url"))
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
