import { getRelayApiKey, getRelayBaseUrl, requireRelayApiKey } from "./config"
import type {
  RelayQuoteV2Request,
  RelayQuoteV2Response,
  RelayRequestV3,
  RelayRequestsV3ListResponse,
} from "./types"

function relayHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  }
  const apiKey = getRelayApiKey()
  if (apiKey) headers["x-api-key"] = apiKey
  return headers
}

async function relayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getRelayBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`
  const res = await fetch(url, {
    ...init,
    headers: { ...relayHeaders(), ...(init?.headers as Record<string, string> | undefined) },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`relay_http_failed:${res.status}:${body.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

export async function relayQuoteV2(body: RelayQuoteV2Request): Promise<RelayQuoteV2Response> {
  requireRelayApiKey()
  return relayFetch<RelayQuoteV2Response>("/quote/v2", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export type RelayListRequestsV3Query = {
  id?: string
  term?: string
  depositAddress?: string
  user?: string
  recipient?: string
  status?: string
  originChainId?: number
  destinationChainId?: number
  limit?: number
  continuation?: string
  includeTotal?: boolean
  includeAuthenticatedData?: boolean
}

function buildRequestsV3Query(query: RelayListRequestsV3Query): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue
    qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ""
}

export async function relayListRequestsV3(
  query: RelayListRequestsV3Query,
): Promise<RelayRequestsV3ListResponse> {
  requireRelayApiKey()
  return relayFetch<RelayRequestsV3ListResponse>(`/requests/v3${buildRequestsV3Query(query)}`)
}

export async function relayGetRequestV3(requestId: string): Promise<RelayRequestV3 | null> {
  const id = String(requestId || "").trim()
  if (!id) return null
  const page = await relayListRequestsV3({ id, limit: 1 })
  return page.requests?.[0] ?? null
}

export async function relayFindRequestByDepositAddressV3(
  depositAddress: string,
): Promise<RelayRequestV3 | null> {
  const addr = String(depositAddress || "").trim()
  if (!addr) return null
  const page = await relayListRequestsV3({ depositAddress: addr, limit: 1, sortBy: "updatedAt" })
  return page.requests?.[0] ?? null
}
