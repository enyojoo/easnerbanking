import { yellowcardFetch } from "./http"

/** SubmitSend / SubmitReceive / fees config. Catalog may still say p2p or eft. */
export type YcChannelType = "bank" | "momo"
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
 * YC submit enum from the live catalog row + the rail the user picked.
 * GET /channels may label NG bank as `p2p` and ZA Instant EFT as `eft`;
 * SubmitSend only accepts `bank` | `momo`. Keep channelId for the live channel.
 */
export function ycSubmitChannelTypeFromChannel(
  channel: { channelType?: unknown } | null | undefined,
  rail: YcChannelRail,
): YcChannelType {
  const raw = String(channel?.channelType ?? "")
    .trim()
    .toLowerCase()
  if (raw.includes("momo") || raw.includes("mobile")) return "momo"
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
