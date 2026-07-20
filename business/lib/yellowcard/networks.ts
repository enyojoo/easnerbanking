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

const NETWORKS_CACHE_TTL_MS = 15 * 60 * 1000
const networksCache = new Map<string, { at: number; networks: YcNetwork[] }>()

function networksCacheKey(params?: { country?: string; currency?: string }): string {
  return `${params?.country?.toUpperCase() ?? ""}|${params?.currency?.toUpperCase() ?? ""}`
}

export async function listYellowcardNetworks(params?: {
  country?: string
  currency?: string
}): Promise<YcNetwork[]> {
  const key = networksCacheKey(params)
  const cached = networksCache.get(key)
  if (cached && Date.now() - cached.at < NETWORKS_CACHE_TTL_MS) {
    return cached.networks
  }
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
  networksCache.set(key, { at: Date.now(), networks: rows })
  return rows
}
