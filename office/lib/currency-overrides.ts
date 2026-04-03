import { supabase } from "@/lib/supabase"

const CATEGORY = "currency"
const DATA_TYPE = "boolean"

function normalizeBool(v: unknown): boolean | null {
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true
  if (s === "false" || s === "0" || s === "no" || s === "off") return false
  return null
}

export type CurrencyActiveOverrides = Record<string, boolean>

export async function loadCurrencyActiveOverrides(): Promise<CurrencyActiveOverrides> {
  // Key format: currency_active_<CODE>
  const { data, error } = await supabase
    .from("system_settings")
    .select("key,value")
    .eq("category", CATEGORY)
    .like("key", "currency_active_%")

  if (error) throw error

  const out: CurrencyActiveOverrides = {}
  for (const row of data ?? []) {
    const key = String((row as any).key || "")
    const code = key.replace(/^currency_active_/, "").trim().toUpperCase()
    if (!code) continue
    const parsed = normalizeBool((row as any).value)
    if (parsed == null) continue
    out[code] = parsed
  }
  return out
}

export async function setCurrencyActiveOverride(code: string, active: boolean): Promise<void> {
  const upper = String(code || "").trim().toUpperCase()
  if (!upper) return

  const key = `currency_active_${upper}`
  const { error } = await supabase.from("system_settings").upsert(
    {
      key,
      value: String(active),
      data_type: DATA_TYPE,
      category: CATEGORY,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  )

  if (error) throw error
}

