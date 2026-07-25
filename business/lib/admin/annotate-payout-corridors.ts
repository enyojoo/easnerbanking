import type { ProviderHealthStatus } from "@easner/shared"
import { hasNoahSellChannelForRail } from "@/lib/noah/channel-availability"
import { annotateCorridorsWithGridAvailability } from "@/lib/grid/corridor-availability"
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
      grid_send_available?: boolean
      grid_receive_available?: boolean
      noah_sell_available?: boolean
    }
  >
> {
  const ycAnnotated = await annotateCorridorsWithYcAvailability(rows)
  const gridAnnotated = await annotateCorridorsWithGridAvailability(ycAnnotated)
  const out: Array<
    T & {
      provider_health?: Record<string, ProviderHealthStatus>
      yc_send_available?: boolean
      yc_receive_available?: boolean
      grid_send_available?: boolean
      grid_receive_available?: boolean
      noah_sell_available?: boolean
    }
  > = []

  for (const row of gridAnnotated) {
    const routing = parseRouting(row.provider_routing)
    const hasYc =
      routing.some((r) => r.provider === "yellowcard") ||
      row.yc_send_available === true ||
      row.yc_receive_available === true
    const hasGrid =
      routing.some((r) => r.provider === "grid") ||
      row.grid_send_available === true ||
      row.grid_receive_available === true

    const provider_health: Record<string, ProviderHealthStatus> = {}

    // Probe Noah sell regardless of current routing (YC-only rows may still overlap Noah).
    const rail = row.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
    const noahOk = await hasNoahSellChannelForRail({
      country: row.country_code,
      fiatCurrency: row.currency_code,
      rail,
    })
    provider_health.noah = noahOk ? "ok" : "unavailable"

    if (hasYc) {
      provider_health.yellowcard =
        row.yc_send_available === true || row.yc_receive_available === true ? "ok" : "unavailable"
    }

    if (hasGrid) {
      provider_health.grid =
        row.grid_send_available === true || row.grid_receive_available === true
          ? "ok"
          : "unavailable"
    }

    out.push({
      ...row,
      ...(noahOk ? { noah_sell_available: true } : {}),
      ...(Object.keys(provider_health).length ? { provider_health } : {}),
    })
  }
  return out
}
