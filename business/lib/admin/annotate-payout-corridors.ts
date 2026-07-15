import type { ProviderHealthStatus } from "@easner/shared"
import { hasNoahSellChannel } from "@/lib/noah/channel-availability"
import { annotateCorridorsWithYcAvailability } from "@/lib/yellowcard/channel-availability"

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
): Promise<
  Array<
    T & {
      provider_health?: Record<string, ProviderHealthStatus>
      yc_send_available?: boolean
      yc_receive_available?: boolean
    }
  >
> {
  const ycAnnotated = await annotateCorridorsWithYcAvailability(rows)
  const out: Array<
    T & {
      provider_health?: Record<string, ProviderHealthStatus>
      yc_send_available?: boolean
      yc_receive_available?: boolean
    }
  > = []

  for (const row of ycAnnotated) {
    const routing = parseRouting(row.provider_routing)
    const hasNoah = routing.some((r) => r.provider === "noah") || routing.length === 0
    const hasYc =
      routing.some((r) => r.provider === "yellowcard") ||
      row.yc_send_available === true ||
      row.yc_receive_available === true

    const provider_health: Record<string, ProviderHealthStatus> = {}
    if (hasNoah) {
      const ok = await hasNoahSellChannel({
        country: row.country_code,
        fiatCurrency: row.currency_code,
      })
      provider_health.noah = ok ? "ok" : "unavailable"
    }
    if (hasYc) {
      provider_health.yellowcard =
        row.yc_send_available === true || row.yc_receive_available === true ? "ok" : "unavailable"
    }

    out.push({
      ...row,
      ...(Object.keys(provider_health).length ? { provider_health } : {}),
    })
  }
  return out
}
