import { createDecipheriv, createHash } from "node:crypto"

function legacyEncryptionKey(): Buffer {
  const configured = process.env.PAYROLL_DATA_ENCRYPTION_KEY
  if (!configured) {
    throw new Error(
      "PAYROLL_DATA_ENCRYPTION_KEY is required only while migrating legacy Payroll methods.",
    )
  }
  return createHash("sha256").update(configured, "utf8").digest()
}

export function decryptLegacyPayrollMethodDetails(
  value: string,
): Record<string, string> {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".")
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported legacy Payroll method ciphertext")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    legacyEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as Record<string, string>
}
