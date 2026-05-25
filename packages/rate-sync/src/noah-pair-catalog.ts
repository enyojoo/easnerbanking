import type { SupabaseClient } from "@supabase/supabase-js"

export type NoahRatePair = {
  from_currency: string
  to_currency: string
  country_code: string
}

const WALLET_SOURCES = ["USD", "EUR"] as const

/**
 * Enabled payout corridors × USD/EUR wallet sources.
 * One row per (from, to); first corridor wins for country_code when duplicate fiats exist.
 */
export async function loadNoahRatePairsFromSupabase(
  supabase: SupabaseClient,
): Promise<NoahRatePair[]> {
  const { data, error } = await supabase
    .from("payout_corridors")
    .select("country_code,currency_code")
    .eq("enabled", true)
    .order("sort_order", { ascending: true, nullsFirst: false })

  if (error) throw error

  const countryByFiat = new Map<string, string>()
  for (const row of data ?? []) {
    const fiat = String((row as { currency_code?: string }).currency_code ?? "").toUpperCase()
    const country = String((row as { country_code?: string }).country_code ?? "").toUpperCase()
    if (!fiat || !country || countryByFiat.has(fiat)) continue
    countryByFiat.set(fiat, country)
  }

  const out: NoahRatePair[] = []
  for (const from of WALLET_SOURCES) {
    for (const [to, country_code] of countryByFiat) {
      if (to === from) continue
      out.push({ from_currency: from, to_currency: to, country_code })
    }
  }

  return out.sort((a, b) =>
    a.to_currency === b.to_currency
      ? a.from_currency.localeCompare(b.from_currency)
      : a.to_currency.localeCompare(b.to_currency),
  )
}
