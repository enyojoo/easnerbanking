import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

function encryptionKey(): Buffer {
  const configured = process.env.PAYROLL_DATA_ENCRYPTION_KEY
  if (!configured) throw new Error("PAYROLL_DATA_ENCRYPTION_KEY is required")
  return createHash("sha256").update(configured, "utf8").digest()
}

export function encryptPayrollMethodDetails(details: Record<string, string>): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(details), "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export function decryptPayrollMethodDetails(value: string): Record<string, string> {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".")
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported payroll method ciphertext")
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"))
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8")) as Record<string, string>
}

export function maskPayrollMethodDetails(
  type: "bank" | "mobile_money" | "stablecoin",
  details: Record<string, string>,
): Record<string, string> {
  const tail = (value: string | undefined) => value ? `•••• ${value.replace(/\s/g, "").slice(-4)}` : "••••"
  if (type === "bank") {
    return {
      bankName: details.bankName || "Bank account",
      account: tail(details.accountNumber),
      countryCode: details.countryCode || "",
      currency: details.currency || "",
    }
  }
  if (type === "mobile_money") {
    return {
      provider: details.provider || "Mobile money",
      phone: tail(details.phoneNumber),
      countryCode: details.countryCode || "",
      currency: details.currency || "",
    }
  }
  return {
    network: details.network || "Stablecoin",
    wallet: tail(details.walletAddress),
    asset: details.asset || details.currency || "",
  }
}
