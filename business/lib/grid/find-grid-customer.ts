import { gridFetch, gridFetchAllPages, GridHttpError } from "./http"
import { normalizeGridCustomerId } from "./quote-request"
import type { GridCustomer } from "./types"

export function isGridCustomerNotFoundError(error: unknown): boolean {
  if (!(error instanceof GridHttpError)) return false
  if (error.status === 404) return true
  const body = error.body
  if (!body || typeof body !== "object") return false
  return String((body as { code?: unknown }).code ?? "") === "CUSTOMER_NOT_FOUND"
}

export function parseGridCustomerListPayload(payload: unknown): GridCustomer[] {
  if (Array.isArray(payload)) return payload as GridCustomer[]
  if (!payload || typeof payload !== "object") return []
  const record = payload as { data?: unknown; customers?: unknown }
  if (Array.isArray(record.data)) return record.data as GridCustomer[]
  if (Array.isArray(record.customers)) return record.customers as GridCustomer[]
  return []
}

export function pickLatestGridCustomerForPlatformId(
  rows: GridCustomer[],
  platformCustomerId: string,
): GridCustomer | null {
  const wanted = platformCustomerId.trim()
  const matches = rows.filter((row) => {
    if (!row?.id) return false
    if (!wanted) return true
    const platformId = String(row.platformCustomerId ?? "").trim()
    return !platformId || platformId === wanted
  })
  if (matches.length === 0) return null
  return [...matches].sort((a, b) => String(b.id).localeCompare(String(a.id)))[0] ?? null
}

export async function findGridCustomerByPlatformId(
  platformCustomerId: string,
): Promise<GridCustomer | null> {
  const rows = await gridFetchAllPages<GridCustomer>({
    path: "/customers",
    query: { platformCustomerId, limit: 50 },
    mapPage: (page) => parseGridCustomerListPayload(page),
  })
  const matched = pickLatestGridCustomerForPlatformId(rows, platformCustomerId)
  if (matched) return matched

  const fallback = await gridFetch<unknown>({
    method: "GET",
    path: `/customers?${new URLSearchParams({ limit: "50" }).toString()}`,
  })
  return pickLatestGridCustomerForPlatformId(
    parseGridCustomerListPayload(fallback),
    platformCustomerId,
  )
}

export async function requireExistingGridCustomer(customerId: string): Promise<GridCustomer | null> {
  const id = normalizeGridCustomerId(customerId)
  if (!id) return null
  try {
    return await gridFetch<GridCustomer>({
      method: "GET",
      path: `/customers/${encodeURIComponent(id)}`,
    })
  } catch (e) {
    if (isGridCustomerNotFoundError(e)) return null
    throw e
  }
}
