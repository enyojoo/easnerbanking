import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"

export type YcPayInNetworkOption = { id: string; name: string }

/** MoMo networks for YC pay-in (scoped to receive channel when available). */
export async function resolveYcPayInNetworks(input: {
  country: string
  currency: string
}): Promise<YcPayInNetworkOption[]> {
  const country = input.country.trim().toUpperCase()
  const currency = input.currency.trim().toUpperCase()
  if (!country || !currency) return []

  const channels = await listYellowcardChannels()
  const channel = findYcReceiveChannel(channels, {
    country,
    currency,
    rail: "mobile_money",
  })
  const channelId = String(channel?.id ?? channel?.channelId ?? "").trim()

  let rows = await listYellowcardNetworks({ country, currency })
  rows = rows.filter((n) => String(n.status ?? "").toLowerCase() !== "inactive")

  if (channelId) {
    const scoped = rows.filter(
      (n) =>
        Array.isArray(n.channelIds) &&
        n.channelIds.some((id) => String(id).trim() === channelId),
    )
    if (scoped.length > 0) rows = scoped
  }

  return rows
    .map((n) => ({
      id: String(n.id ?? n.networkId ?? "").trim(),
      name: String(n.name ?? n.code ?? "").trim(),
    }))
    .filter((n) => n.id && n.name)
}
