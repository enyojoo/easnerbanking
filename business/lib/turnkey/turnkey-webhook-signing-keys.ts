import { createHash, createPublicKey } from "node:crypto"

/**
 * Turnkey Webhooks V2 platform signing keys (`X-Turnkey-Signature-Key-Id`).
 * Override via `TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEYS_JSON` or `TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY`.
 * Obtain the public key from Turnkey (support / dashboard); it is not generated locally.
 * @see https://turnkey-0e7c1f5b-taylor-eng-4112-webhooks-v2-docs.mintlify.app/developer-reference/webhooks
 */

export type TurnkeyWebhookSigningKeyMaterial = {
  /** 32-byte Ed25519 public key (raw). */
  publicKey: Buffer
  /** Optional PEM for logging / health only. */
  source: "builtin" | "env_default" | "env_json"
}

/** Well-known Turnkey platform key ids (public key bytes supplied via env until published in docs). */
export const TURNKEY_WEBHOOK_SIGNING_KEY_IDS = ["turnkey_webhook_signing_key_001"] as const

function decodeEd25519PublicKey(raw: string): Buffer | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    try {
      const key = createPublicKey(trimmed)
      const spki = key.export({ type: "spki", format: "der" }) as Buffer
      if (spki.length === 44 && spki[0] === 0x30) {
        return spki.subarray(12)
      }
      if (spki.length === 32) return spki
    } catch {
      return null
    }
  }

  const hex = trimmed.replace(/^0x/i, "")
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length === 64) {
    try {
      return Buffer.from(hex, "hex")
    } catch {
      return null
    }
  }

  try {
    const norm = trimmed.replace(/-/g, "+").replace(/_/g, "/")
    const padLen = (4 - (norm.length % 4)) % 4
    const buf = Buffer.from(norm + "=".repeat(padLen), "base64")
    if (buf.length === 32) return buf
    if (buf.length === 44 && buf[0] === 0x30) return buf.subarray(12)
  } catch {
    /* ignore */
  }

  return null
}

function parseEnvSigningKeysJson(): Record<string, string> {
  const raw = process.env.TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEYS_JSON?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k.trim()] = v.trim()
    }
    return out
  } catch {
    console.warn("[turnkey-webhook] TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEYS_JSON is not valid JSON")
    return {}
  }
}

/**
 * Resolve Ed25519 public key material for a V2 `X-Turnkey-Signature-Key-Id`.
 * Returns null when not configured — set keys from Turnkey dashboard / support.
 */
export function resolveTurnkeyWebhookEd25519PublicKey(
  keyId: string | null | undefined,
): TurnkeyWebhookSigningKeyMaterial | null {
  const id = keyId?.trim() || "turnkey_webhook_signing_key_001"
  const fromJson = parseEnvSigningKeysJson()
  const jsonValue = fromJson[id] ?? fromJson.turnkey_webhook_signing_key_001
  if (jsonValue) {
    const publicKey = decodeEd25519PublicKey(jsonValue)
    if (publicKey) return { publicKey, source: "env_json" }
  }

  const defaultKey = process.env.TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY?.trim()
  if (defaultKey) {
    const publicKey = decodeEd25519PublicKey(defaultKey)
    if (publicKey) return { publicKey, source: "env_default" }
  }

  return null
}

export function isTurnkeyWebhookEd25519SigningConfigured(): boolean {
  return resolveTurnkeyWebhookEd25519PublicKey("turnkey_webhook_signing_key_001") != null
}

export function turnkeyWebhookSigningPublicKeyFingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16)
}
