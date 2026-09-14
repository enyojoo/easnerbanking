import type { SupabaseClient } from "@supabase/supabase-js"

export type PlatformAccessSurface = "business_web" | "consumer_mobile"

export const MAINTENANCE_MODE_BUSINESS_KEY = "maintenance_mode_business"
export const MAINTENANCE_MODE_PERSONAL_KEY = "maintenance_mode_personal"
export const REGISTRATION_ENABLED_BUSINESS_KEY = "registration_enabled_business"
export const REGISTRATION_ENABLED_PERSONAL_KEY = "registration_enabled_personal"

export const PLATFORM_MAINTENANCE_CODE = "PLATFORM_MAINTENANCE"
export const REGISTRATION_CLOSED_CODE = "REGISTRATION_CLOSED"

export type ProductAccessFlags = {
  maintenance: boolean
  registration: boolean
}

export type PlatformAccess = {
  business: ProductAccessFlags
  personal: ProductAccessFlags
}

function parseSettingBool(value: unknown, fallback: boolean): boolean {
  if (value == null) return fallback
  const s = String(value).trim().toLowerCase()
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true
  if (s === "false" || s === "0" || s === "no" || s === "off") return false
  return fallback
}

const ACCESS_KEYS = [
  MAINTENANCE_MODE_BUSINESS_KEY,
  MAINTENANCE_MODE_PERSONAL_KEY,
  REGISTRATION_ENABLED_BUSINESS_KEY,
  REGISTRATION_ENABLED_PERSONAL_KEY,
] as const

/** Uncached Office access flags. Defaults: maintenance off, registration on. */
export async function readPlatformAccess(admin: SupabaseClient): Promise<PlatformAccess> {
  const { data, error } = await admin.from("system_settings").select("key,value").in("key", [...ACCESS_KEYS])

  const map = new Map<string, string>()
  if (!error) {
    for (const row of data ?? []) {
      map.set(String(row.key), String(row.value ?? ""))
    }
  } else {
    console.error("[platform-access] settings read failed:", error.message)
  }

  return {
    business: {
      maintenance: parseSettingBool(map.get(MAINTENANCE_MODE_BUSINESS_KEY), false),
      registration: parseSettingBool(map.get(REGISTRATION_ENABLED_BUSINESS_KEY), true),
    },
    personal: {
      maintenance: parseSettingBool(map.get(MAINTENANCE_MODE_PERSONAL_KEY), false),
      registration: parseSettingBool(map.get(REGISTRATION_ENABLED_PERSONAL_KEY), true),
    },
  }
}

export function accessForSurface(access: PlatformAccess, surface: PlatformAccessSurface): ProductAccessFlags {
  return surface === "business_web" ? access.business : access.personal
}

export function platformMaintenanceMessage(surface: PlatformAccessSurface): string {
  return surface === "business_web"
    ? "Easner Business is temporarily unavailable."
    : "The Easner app is temporarily unavailable."
}

export function registrationClosedMessage(surface: PlatformAccessSurface): string {
  return surface === "business_web"
    ? "New Easner Business accounts are not being accepted right now."
    : "New Easner app accounts are not being accepted right now."
}

export function registrationClosedBlock(
  access: PlatformAccess,
  surface: PlatformAccessSurface,
): { code: typeof REGISTRATION_CLOSED_CODE; error: string } | null {
  if (accessForSurface(access, surface).registration) return null
  return { code: REGISTRATION_CLOSED_CODE, error: registrationClosedMessage(surface) }
}
