import { yellowcardFetch } from "./http"

export type YcNetwork = {
  id?: string
  networkId?: string
  code?: string
  name?: string
  country?: string
  currency?: string
  status?: string
  channelIds?: string[]
  [key: string]: unknown
}

export async function listYellowcardNetworks(params?: {
  country?: string
  currency?: string
}): Promise<YcNetwork[]> {
  const qs = new URLSearchParams()
  if (params?.country) qs.set("country", params.country.toUpperCase())
  const q = qs.toString()
  const path = q ? `/networks?${q}` : "/networks"
  const res = await yellowcardFetch<{ networks?: YcNetwork[] } | YcNetwork[]>({
    method: "GET",
    path,
  })
  let rows: YcNetwork[] = Array.isArray(res) ? res : Array.isArray(res.networks) ? res.networks : []
  const currency = params?.currency?.trim().toUpperCase()
  if (currency) {
    rows = rows.filter((n) => !n.currency || String(n.currency).toUpperCase() === currency)
  }
  return rows
}
