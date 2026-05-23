import type { ProviderHealthStatus } from "@easner/shared"
import { hasNoahSellChannel } from "@/lib/noah/channel-availability"

type AdminCorridorRow = {
  id: string
  rail: string
  country_code: string
  currency_code: string
  provider_routing?: unknown
  [key: string]: unknown
}

function parseRouting(raw: unknown): Array<{ provider: string }> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const provider = String((item as Record<string, unknown>).provider ?? "").trim()
      return provider ? { provider } : null
    })
    .filter(Boolean) as Array<{ provider: string }>
}

export async function annotateAdminCorridorsWithProviderHealth<T extends AdminCorridorRow>(
  rows: T[],
): Promise<Array<T & { provider_health?: Record<string, ProviderHealthStatus> }>> {
  const out: Array<T & { provider_health?: Record<string, ProviderHealthStatus> }> = []
  for (const row of rows) {
    const routing = parseRouting(row.provider_routing)
    const hasNoah = routing.some((r) => r.provider === "noah") || routing.length === 0
    const provider_health: Record<string, ProviderHealthStatus> = {}
    if (hasNoah) {
      const ok = await hasNoahSellChannel({
        country: row.country_code,
        fiatCurrency: row.currency_code,
      })
      provider_health.noah = ok ? "ok" : "unavailable"
    }
    out.push({ ...row, ...(Object.keys(provider_health).length ? { provider_health } : {}) })
  }
  return out
}
