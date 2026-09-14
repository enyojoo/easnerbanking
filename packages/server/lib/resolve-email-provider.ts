import {
  DEFAULT_EMAIL_PROVIDER,
  EMAIL_PROVIDER_SETTING_KEY,
  parseEmailProvider,
  readEmailProviderEnvOverride,
  type EmailProvider,
} from "./email-provider"
import { createServerClient } from "./supabase"

const PROVIDER_CACHE_TTL_MS = 60_000

let cachedProvider: { value: EmailProvider; at: number } | null = null

export function clearEmailProviderCache(): void {
  cachedProvider = null
}

export async function loadEmailProviderFromSettings(): Promise<EmailProvider> {
  try {
    const admin = createServerClient()
    const { data, error } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", EMAIL_PROVIDER_SETTING_KEY)
      .maybeSingle()
    if (error) {
      console.warn("[email] provider setting read failed:", error.message)
      return DEFAULT_EMAIL_PROVIDER
    }
    return parseEmailProvider(data?.value, DEFAULT_EMAIL_PROVIDER)
  } catch (error) {
    console.warn(
      "[email] provider setting skipped:",
      error instanceof Error ? error.message : "unknown",
    )
    return DEFAULT_EMAIL_PROVIDER
  }
}

export async function resolveEmailProvider(): Promise<EmailProvider> {
  const envOverride = readEmailProviderEnvOverride()
  if (envOverride) return envOverride

  const now = Date.now()
  if (cachedProvider && now - cachedProvider.at < PROVIDER_CACHE_TTL_MS) {
    return cachedProvider.value
  }

  const value = await loadEmailProviderFromSettings()
  cachedProvider = { value, at: now }
  return value
}
