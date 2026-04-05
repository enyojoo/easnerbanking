import { createSupabaseAdmin } from "@/lib/supabase/admin"

type CurrencyCode = "USD" | "EUR" | "GBP" | "NGN"

export type CurrencyPolicy = {
  code: CurrencyCode
  available: boolean
  active: boolean
}

const ALL_CODES: CurrencyCode[] = ["USD", "EUR", "GBP", "NGN"]

/** Human labels for business base currency UI (subset of tracked fiat policies). */
export const FIAT_CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  NGN: "Nigerian Naira",
}

export type AllowedBaseCurrencyOption = { code: CurrencyCode; label: string }

/** Office-backed list: currencies enabled for selection as org **base currency** (settings + onboarding). */
export async function getAllowedBaseCurrencyOptions(): Promise<AllowedBaseCurrencyOption[]> {
  const policies = await getGlobalCurrencyPolicies()
  const out: AllowedBaseCurrencyOption[] = []
  for (const code of ALL_CODES) {
    const p = policies[code]
    if (p.available && p.active) {
      out.push({ code, label: `${code} - ${FIAT_CURRENCY_LABELS[code]}` })
    }
  }
  return out
}

/** True if `code` is a tracked policy currency and is both available and active. */
export async function isAllowedBaseCurrency(code: string): Promise<boolean> {
  const upper = String(code || "").trim().toUpperCase() as CurrencyCode
  if (!ALL_CODES.includes(upper)) return false
  const policies = await getGlobalCurrencyPolicies()
  const p = policies[upper]
  return p.available && p.active
}

function normalizeBool(v: string | null | undefined, fallback: boolean): boolean {
  if (v == null) return fallback
  const s = v.trim().toLowerCase()
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true
  if (s === "false" || s === "0" || s === "no" || s === "off") return false
  return fallback
}

export async function getGlobalCurrencyPolicies(): Promise<Record<CurrencyCode, CurrencyPolicy>> {
  const admin = createSupabaseAdmin()
  const keys = ALL_CODES.flatMap((code) => [`currency_available_${code}`, `currency_active_${code}`])
  const { data } = await admin.from("system_settings").select("key,value").in("key", keys)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    map.set(String(row.key), String(row.value ?? ""))
  }

  const out = {} as Record<CurrencyCode, CurrencyPolicy>
  for (const code of ALL_CODES) {
    const isDefault = code === "USD" || code === "EUR"
    const availableDefault = isDefault ? true : false
    const available = normalizeBool(map.get(`currency_available_${code}`), availableDefault)
    const active = normalizeBool(map.get(`currency_active_${code}`), true)
    out[code] = { code, available, active }
  }
  return out
}

export async function ensureCurrencyUsable(code: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const upper = String(code || "").toUpperCase() as CurrencyCode
  if (!ALL_CODES.includes(upper)) return { ok: true }

  const policies = await getGlobalCurrencyPolicies()
  const policy = policies[upper]
  if (!policy.available) {
    return { ok: false, reason: `${upper} is not available yet.` }
  }
  if (!policy.active) {
    return { ok: false, reason: `${upper} is temporarily unavailable.` }
  }
  return { ok: true }
}

