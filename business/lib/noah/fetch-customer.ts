import {
  compactUuidForNoahCustomerId,
  noahCustomerIdFromBusinessId,
  noahCustomerIdFromUserId,
  type NoahCustomerScope,
} from "./customer-id"
import { NoahHttpError, noahFetch } from "./http"

/** Thrown when every candidate CustomerID returned 404 (see `attemptedIds`). */
export class NoahCustomerNotFoundAfterTriesError extends Error {
  readonly attemptedIds: readonly string[]

  constructor(attemptedIds: string[], lastError: unknown) {
    const last =
      lastError instanceof Error ? lastError.message : String(lastError)
    super(
      `Noah customer not found after trying: ${attemptedIds.join(", ")}. Last: ${last}`,
    )
    this.name = "NoahCustomerNotFoundAfterTriesError"
    this.attemptedIds = attemptedIds
  }
}

/** True when GET /customers/:id missed — prefer `NoahHttpError.status === 404` (Noah `Detail` text is not stable). */
export function isNoahCustomerNotFoundError(e: unknown): boolean {
  if (e instanceof NoahHttpError) return e.status === 404
  const msg = e instanceof Error ? e.message : String(e)
  return /not\s*found/i.test(msg) || /\b404\b/.test(msg)
}

/**
 * GET /customers/:id — try primary id, bare compact UUID, `eind_{uuid}`, and hyphenated auth UUID (Noah envs differ).
 * Persists `resolvedCustomerId` via callers’ `syncNoahCustomerToSupabase`.
 */
export async function fetchNoahCustomerWithIndividualFallback(
  userId: string,
  primaryNoahCustomerId: string,
): Promise<{ customer: Record<string, unknown>; resolvedCustomerId: string }> {
  const bare = compactUuidForNoahCustomerId(userId)
  const eind = noahCustomerIdFromUserId(userId)
  const hyphenated = userId.trim().toLowerCase()
  const get = (id: string) =>
    noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(id)}`,
    })

  const order = [primaryNoahCustomerId, bare, eind, hyphenated]
  const seen = new Set<string>()
  const attemptedIds: string[] = []
  let lastNotFound: unknown

  for (const id of order) {
    if (seen.has(id)) continue
    seen.add(id)
    attemptedIds.push(id)
    try {
      const customer = await get(id)
      return { customer, resolvedCustomerId: id }
    } catch (e) {
      if (!isNoahCustomerNotFoundError(e)) throw e
      lastNotFound = e
    }
  }

  if (lastNotFound) {
    throw new NoahCustomerNotFoundAfterTriesError(attemptedIds, lastNotFound)
  }
  throw new Error("Noah customer fetch failed")
}

/**
 * GET /customers/:id — try stored id, `ebiz_{uuid}`, compact UUID, and hyphenated business id.
 */
export async function fetchNoahCustomerWithBusinessFallback(
  businessId: string,
  primaryNoahCustomerId: string,
): Promise<{ customer: Record<string, unknown>; resolvedCustomerId: string }> {
  const bare = compactUuidForNoahCustomerId(businessId)
  const ebiz = noahCustomerIdFromBusinessId(businessId)
  const hyphenated = businessId.trim().toLowerCase()
  const get = (id: string) =>
    noahFetch<Record<string, unknown>>({
      method: "GET",
      path: `/customers/${encodeURIComponent(id)}`,
    })

  const order = [primaryNoahCustomerId, ebiz, bare, hyphenated]
  const seen = new Set<string>()
  const attemptedIds: string[] = []
  let lastNotFound: unknown

  for (const id of order) {
    if (seen.has(id)) continue
    seen.add(id)
    attemptedIds.push(id)
    try {
      const customer = await get(id)
      return { customer, resolvedCustomerId: id }
    } catch (e) {
      if (!isNoahCustomerNotFoundError(e)) throw e
      lastNotFound = e
    }
  }

  if (lastNotFound) {
    throw new NoahCustomerNotFoundAfterTriesError(attemptedIds, lastNotFound)
  }
  throw new Error("Noah customer fetch failed")
}

export async function fetchNoahCustomerForScope(
  scope: NoahCustomerScope,
  subjectId: string,
  primaryNoahCustomerId: string,
): Promise<{ customer: Record<string, unknown>; resolvedCustomerId: string }> {
  if (scope === "business") {
    return fetchNoahCustomerWithBusinessFallback(subjectId, primaryNoahCustomerId)
  }
  return fetchNoahCustomerWithIndividualFallback(subjectId, primaryNoahCustomerId)
}
