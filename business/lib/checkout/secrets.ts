import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto"

export const CHECKOUT_SECRET_KEY_ID = "checkout-secret-v1"

export type CheckoutKeyMode = "test" | "live"

function checkoutSecretKey(): Buffer {
  const configured =
    process.env.CHECKOUT_SECRET_ENCRYPTION_KEY?.trim() ||
    process.env.KYB_PII_ENCRYPTION_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!configured) {
    throw new Error("CHECKOUT_SECRET_ENCRYPTION_KEY is required to store checkout secrets")
  }
  return createHash("sha256").update(configured, "utf8").digest()
}

/** Reversible storage for secrets Easner must replay (merchant webhook signing). */
export function encryptCheckoutSecret(value: string): { ciphertext: string; keyId: string } {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", checkoutSecretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`,
    keyId: CHECKOUT_SECRET_KEY_ID,
  }
}

export function decryptCheckoutSecret(ciphertext: string | null | undefined): string {
  const raw = String(ciphertext ?? "").trim()
  if (!raw) return ""
  try {
    const [version, ivValue, tagValue, encryptedValue] = raw.split(".")
    if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) return ""
    const decipher = createDecipheriv(
      "aes-256-gcm",
      checkoutSecretKey(),
      Buffer.from(ivValue, "base64url"),
    )
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return ""
  }
}

/** API secret keys are only ever compared, so a hash is enough. */
export function hashCheckoutSecretKey(secretKey: string): string {
  return createHash("sha256").update(secretKey.trim(), "utf8").digest("hex")
}

export function generatePublishableKey(mode: CheckoutKeyMode): string {
  return `easner_pk_${mode}_${randomBytes(16).toString("hex")}`
}

export function generateSecretKey(mode: CheckoutKeyMode): string {
  return `easner_sk_${mode}_${randomBytes(24).toString("hex")}`
}

export function generateWebhookSigningSecret(): string {
  return `easner_whsec_${randomBytes(24).toString("hex")}`
}

export function parseCheckoutKeyMode(raw: unknown): CheckoutKeyMode | null {
  const value = String(raw ?? "").trim().toLowerCase()
  return value === "test" || value === "live" ? value : null
}

/** Mode encoded in a merchant key, e.g. `easner_sk_live_…` → `live`. */
export function checkoutKeyMode(key: string): CheckoutKeyMode | null {
  const match = /^easner_(?:pk|sk)_(test|live)_[0-9a-f]+$/i.exec(key.trim())
  return match ? (match[1].toLowerCase() as CheckoutKeyMode) : null
}

export function checkoutKeyLast4(key: string): string {
  return key.trim().slice(-4)
}

/** `Easner-Signature: t=…,v1=…` over `<timestamp>.<body>`. */
export function signMerchantWebhookPayload(input: {
  secret: string
  body: string
  timestampSeconds: number
}): string {
  const signature = createHmac("sha256", input.secret)
    .update(`${input.timestampSeconds}.${input.body}`, "utf8")
    .digest("hex")
  return `t=${input.timestampSeconds},v1=${signature}`
}
