import { yellowcardFetch } from "./http"

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
