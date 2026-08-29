import { decryptCheckoutSecret, encryptCheckoutSecret } from "@/lib/checkout/secrets"

export type LinkOAuthSecrets = {
  access_token: string
  refresh_token?: string
  updated_at?: string
}

function parseSecrets(raw: string): LinkOAuthSecrets | null {
  const text = String(raw || "").trim()
  if (!text) return null
  if (text.startsWith("{")) {
    try {
      const row = JSON.parse(text) as { access_token?: unknown; refresh_token?: unknown; updated_at?: unknown }
      const access = String(row.access_token || "").trim()
      if (!access) return null
      const refresh = String(row.refresh_token || "").trim()
      return {
        access_token: access,
        refresh_token: refresh || undefined,
        updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
      }
    } catch {
      return null
    }
  }
  return { access_token: text }
}

export function encryptLinkOAuthSecrets(secrets: LinkOAuthSecrets): string {
  return encryptCheckoutSecret(
    JSON.stringify({
      access_token: secrets.access_token,
      refresh_token: secrets.refresh_token || undefined,
      updated_at: secrets.updated_at || new Date().toISOString(),
    }),
  ).ciphertext
}

export function encryptLinkOAuthToken(token: string): string {
  return encryptLinkOAuthSecrets({ access_token: token })
}

export function decryptLinkOAuthSecrets(ciphertext: string | null | undefined): LinkOAuthSecrets | null {
  return parseSecrets(decryptCheckoutSecret(ciphertext))
}

export function decryptLinkOAuthToken(ciphertext: string | null | undefined): string {
  return decryptLinkOAuthSecrets(ciphertext)?.access_token || ""
}
