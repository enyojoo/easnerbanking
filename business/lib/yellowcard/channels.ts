import { yellowcardFetch } from "./http"

export type YcChannelType = "bank" | "momo" | "eft" | "p2p"
export type YcChannelRail = "bank_transfer" | "mobile_money"

export function toYcChannelType(rail: YcChannelRail): YcChannelType {
  return rail === "mobile_money" ? "momo" : "bank"
}

export function readYcChannelId(channel: { id?: unknown; channelId?: unknown } | null | undefined): string | null {
  if (!channel) return null
  const channelId = String(channel.id ?? channel.channelId ?? "").trim()
  return channelId || null
}

/**
 * Live YC channelType for POST /send and /receive.
 * ZA withdraw is Instant EFT (`eft`); NG withdraw is `p2p` (bank channels are inactive).
 */
export function ycSubmitChannelTypeFromChannel(
  channel: { channelType?: unknown } | null | undefined,
  rail: YcChannelRail,
): YcChannelType {
  const raw = String(channel?.channelType ?? "")
    .trim()
    .toLowerCase()
  if (raw === "eft" || raw.includes("eft")) return "eft"
  if (raw.includes("momo") || raw.includes("mobile")) return "momo"
  if (raw === "p2p" || raw.includes("p2p")) return "p2p"
  if (raw === "bank" || raw.includes("bank")) return "bank"
  return toYcChannelType(rail)
}

export function readYcResponseChannelId(
  response: Record<string, unknown> | null | undefined,
): string | null {
  if (!response) return null
  const channelId = String(response.channelId ?? response.channel_id ?? "").trim()
  return channelId || null
}

export type YcChannel = {
  id?: string
  channelId?: string
  channelType?: string
  country?: string
  currency?: string
  status?: string
  apiStatus?: string
  rampType?: string
  [key: string]: unknown
}

const CHANNELS_CACHE_TTL_MS = 60_000
let channelsCache: { at: number; channels: YcChannel[] } | null = null

export async function listYellowcardChannels(): Promise<YcChannel[]> {
  if (channelsCache && Date.now() - channelsCache.at < CHANNELS_CACHE_TTL_MS) {
    return channelsCache.channels
  }
  const res = await yellowcardFetch<{ channels?: YcChannel[] } | YcChannel[]>({
    method: "GET",
    path: "/channels",
  })
  const channels = Array.isArray(res) ? res : Array.isArray(res.channels) ? res.channels : []
  channelsCache = { at: Date.now(), channels }
  return channels
}
