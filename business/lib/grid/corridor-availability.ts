import {
  gridDiscoverySupportsCorridor,
  listGridDiscoveries,
} from "@/lib/grid/discoveries"

type PayoutRail = "bank_transfer" | "mobile_money"

export async function annotateCorridorsWithGridAvailability<
  T extends { country_code: string; currency_code: string; rail: string; metadata?: unknown },
>(
  rows: T[],
): Promise<
  Array<
    T & {
      grid_send_available?: boolean
      grid_receive_available?: boolean
    }
  >
> {
  const discoveries = await listGridDiscoveries()

  return rows.map((row) => {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {}
    const rail = (row.rail === "mobile_money" ? "mobile_money" : "bank_transfer") as PayoutRail
    const discoveryOk = gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: row.country_code,
      currencyCode: row.currency_code,
      rail,
    })

    const grid_send_available = meta.grid_send === true || discoveryOk
    const grid_receive_available = meta.grid_receive === true || discoveryOk

    const out: T & { grid_send_available?: boolean; grid_receive_available?: boolean } = { ...row }
    if (grid_send_available) out.grid_send_available = true
    if (grid_receive_available) out.grid_receive_available = true
    return out
  })
}
