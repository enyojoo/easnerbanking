import { yellowcardFetch } from "./http"

export type YcChannel = {
  id?: string
  channelId?: string
  channelType?: string
  country?: string
  currency?: string
  status?: string
  [key: string]: unknown
}

export async function listYellowcardChannels(): Promise<YcChannel[]> {
  const res = await yellowcardFetch<{ channels?: YcChannel[] } | YcChannel[]>({
    method: "GET",
    path: "/channels",
  })
  if (Array.isArray(res)) return res
  return Array.isArray(res.channels) ? res.channels : []
}
