import type { SupabaseClient } from "@supabase/supabase-js"
import { clearEmailProviderCache, EMAIL_PROVIDER_SETTING_KEY, parseEmailProvider } from "@easner/server"
import { WALLET_SEND_COMPLIANCE_PLATFORM_KEY } from "@/lib/wallet-send-compliance/platform-enabled"
import {
  isValidMinNativeVersionInput,
  MAINTENANCE_MODE_BUSINESS_KEY,
  MAINTENANCE_MODE_PERSONAL_KEY,
  MIN_NATIVE_VERSION_PERSONAL_KEY,
  REGISTRATION_ENABLED_BUSINESS_KEY,
  REGISTRATION_ENABLED_PERSONAL_KEY,
} from "@/lib/platform-access"

export type SystemSettingRow = {
  id?: string
  key: string
  value: string
  data_type: string
  category: string
  description?: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type SettingSpec = {
  dataType: "boolean" | "string"
  category: "platform" | "currency"
}

export const SYSTEM_SETTING_ALLOWLIST: Record<string, SettingSpec> = {
  [MAINTENANCE_MODE_BUSINESS_KEY]: { dataType: "boolean", category: "platform" },
  [MAINTENANCE_MODE_PERSONAL_KEY]: { dataType: "boolean", category: "platform" },
  [REGISTRATION_ENABLED_BUSINESS_KEY]: { dataType: "boolean", category: "platform" },
  [REGISTRATION_ENABLED_PERSONAL_KEY]: { dataType: "boolean", category: "platform" },
  [WALLET_SEND_COMPLIANCE_PLATFORM_KEY]: { dataType: "boolean", category: "platform" },
  [EMAIL_PROVIDER_SETTING_KEY]: { dataType: "string", category: "platform" },
  [MIN_NATIVE_VERSION_PERSONAL_KEY]: { dataType: "string", category: "platform" },
  currency_active_USD: { dataType: "boolean", category: "currency" },
  currency_active_EUR: { dataType: "boolean", category: "currency" },
}

export function isAllowedSystemSettingKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(SYSTEM_SETTING_ALLOWLIST, key)
}

function parseBooleanValue(value: unknown): string {
  if (value === true || value === "true" || value === "1" || value === "yes" || value === "on") return "true"
  if (value === false || value === "false" || value === "0" || value === "no" || value === "off") {
    return "false"
  }
  throw new Error("Boolean setting must be true or false")
}

export function normalizeSystemSettingValue(key: string, value: unknown): { value: string; spec: SettingSpec } {
  const spec = SYSTEM_SETTING_ALLOWLIST[key]
  if (!spec) throw new Error(`Unknown setting key: ${key}`)
  if (key === EMAIL_PROVIDER_SETTING_KEY) {
    const provider = parseEmailProvider(value, "ses")
    if (String(value ?? "").trim().toLowerCase() !== provider) {
      throw new Error("email_provider must be ses or sendgrid")
    }
    return { value: provider, spec }
  }
  if (key === MIN_NATIVE_VERSION_PERSONAL_KEY) {
    const version = String(value ?? "").trim()
    if (!isValidMinNativeVersionInput(version)) {
      throw new Error("Minimum app version must be empty or look like 1.10.2")
    }
    return { value: version, spec }
  }
  if (spec.dataType === "boolean") {
    return { value: parseBooleanValue(value), spec }
  }
  return { value: String(value ?? "").trim(), spec }
}

export async function listSystemSettingsAdmin(admin: SupabaseClient): Promise<SystemSettingRow[]> {
  const { data, error } = await admin
    .from("system_settings")
    .select("*")
    .eq("is_active", true)
    .order("category", { ascending: true })
  if (error) throw error
  return (data ?? []) as SystemSettingRow[]
}

export async function upsertSystemSettingsAdmin(
  admin: SupabaseClient,
  settings: Array<{ key: string; value: unknown }>,
): Promise<SystemSettingRow[]> {
  if (!settings.length) throw new Error("settings array required")

  const now = new Date().toISOString()
  const rows = settings.map((item) => {
    const key = String(item.key ?? "").trim()
    if (!isAllowedSystemSettingKey(key)) {
      throw new Error(`Unknown setting key: ${key}`)
    }
    const { value, spec } = normalizeSystemSettingValue(key, item.value)
    return {
      key,
      value,
      data_type: spec.dataType,
      category: spec.category,
      is_active: true,
      updated_at: now,
    }
  })

  const { data, error } = await admin.from("system_settings").upsert(rows, { onConflict: "key" }).select("*")
  if (error) throw error

  if (rows.some((row) => row.key === EMAIL_PROVIDER_SETTING_KEY)) {
    clearEmailProviderCache()
  }

  return (data ?? []) as SystemSettingRow[]
}
