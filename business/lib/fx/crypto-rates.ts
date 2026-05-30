import type { SupabaseClient } from "@supabase/supabase-js"

export type CryptoRateRow = {
  from_currency: string
  to_currency: string
  receive_network: string
  lifi_mid: number
  rate: number
  margin_bps: number
  source: string
  as_of: string
  status: string
}

export function getCryptoRatesRefreshTtlMs(): number {
  const parsed = Number.parseInt(process.env.CRYPTO_RATES_REFRESH_TTL_MS || "300000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 300_000
  return parsed
}

export async function listCryptoRates(
  admin: SupabaseClient,
  filters?: { destinations?: string[]; networks?: string[]; status?: string },
): Promise<CryptoRateRow[]> {
  let q = admin
    .from("crypto_rates")
    .select(
      "from_currency,to_currency,receive_network,lifi_mid,rate,margin_bps,source,as_of,status",
    )

  const status = filters?.status ?? "active"
  if (status !== "all") q = q.eq("status", status)

  const dests = filters?.destinations?.map((d) => d.trim().toUpperCase()).filter(Boolean)
  if (dests?.length) q = q.in("to_currency", dests)

  const nets = filters?.networks?.map((n) => String(n).trim()).filter(Boolean)
  if (nets?.length) q = q.in("receive_network", nets)

  const { data, error } = await q
    .order("to_currency")
    .order("receive_network")
    .order("from_currency")
  if (error) {
    console.warn("[crypto_rates] list:", error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    from_currency: String(row.from_currency ?? "").toUpperCase(),
    to_currency: String(row.to_currency ?? "").toUpperCase(),
    receive_network: String(row.receive_network ?? ""),
    lifi_mid: Number(row.lifi_mid ?? 0),
    rate: Number(row.rate ?? 0),
    margin_bps: Number(row.margin_bps ?? 0),
    source: String(row.source ?? ""),
    as_of: String(row.as_of ?? new Date().toISOString()),
    status: String(row.status ?? ""),
  }))
}

export function findCryptoRate(
  rates: CryptoRateRow[],
  fromCurrency: string,
  toCurrency: string,
  receiveNetwork: string,
): CryptoRateRow | null {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  const net = String(receiveNetwork || "").trim()
  if (!from || !to || !net) return null
  return (
    rates.find(
      (r) =>
        r.from_currency === from &&
        r.to_currency === to &&
        r.receive_network === net &&
        r.status === "active" &&
        r.rate > 0,
    ) ?? null
  )
}

export function isCryptoRateFresh(row: CryptoRateRow, maxAgeMs = getCryptoRatesRefreshTtlMs()): boolean {
  if (row.status !== "active" || row.rate <= 0 || row.lifi_mid <= 0) return false
  const asOfMs = new Date(row.as_of).getTime()
  if (!Number.isFinite(asOfMs) || asOfMs <= 0) return false
  return Date.now() - asOfMs <= maxAgeMs
}

export function areCryptoRatesFresh(rates: CryptoRateRow[], maxAgeMs: number): boolean {
  const active = rates.filter((r) => r.status === "active" && r.rate > 0)
  if (active.length === 0) return false
  const newestMs = active.reduce((latest, row) => Math.max(latest, new Date(row.as_of).getTime()), 0)
  return newestMs > 0 && Date.now() - newestMs <= maxAgeMs
}

export async function ensureCryptoRatesFresh(admin: SupabaseClient): Promise<CryptoRateRow[]> {
  const current = await listCryptoRates(admin)
  if (areCryptoRatesFresh(current, getCryptoRatesRefreshTtlMs())) return current
  const { syncCryptoRatesSafe } = await import("@/lib/fx/crypto-rate-sync")
  const synced = await syncCryptoRatesSafe()
  if (!synced.ok) return current
  return listCryptoRates(admin)
}

let backgroundSyncInFlight: Promise<void> | null = null

export function triggerCryptoRatesBackgroundRefresh(
  admin: SupabaseClient,
  currentRates: CryptoRateRow[],
  maxAgeMs = getCryptoRatesRefreshTtlMs(),
): void {
  if (areCryptoRatesFresh(currentRates, maxAgeMs)) return
  if (backgroundSyncInFlight) return
  backgroundSyncInFlight = (async () => {
    try {
      const { syncCryptoRatesSafe } = await import("@/lib/fx/crypto-rate-sync")
      await syncCryptoRatesSafe()
    } catch {
      /* best effort */
    } finally {
      backgroundSyncInFlight = null
    }
  })()
}
