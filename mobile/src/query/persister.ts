import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import type { Query } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'

/**
 * Disk persistence policy for Easner mobile.
 *
 * Only queries explicitly tagged `meta.safePersist === true` are written to
 * AsyncStorage. Balances, session-scoped data, and anything money-sensitive
 * MUST NOT set `safePersist`; they live in memory only.
 *
 * The persister is bucketed by `APP_BUILD_ID` so a shipped schema change
 * invalidates every cached payload in a single release – readers never see
 * a shape mismatch between old persisted data and new code.
 */

export const MOBILE_APP_BUILD_ID =
  (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
  (Constants.expoConfig?.android?.versionCode?.toString() as string | undefined) ??
  Constants.expoConfig?.version ??
  '0'

export const MOBILE_QUERY_STORAGE_KEY = 'easner.query.cache.v2'

export const MOBILE_QUERY_MAX_AGE_MS = 7 * 24 * 60 * 60_000

export function shouldPersistMobileQuery(query: Query): boolean {
  return query.meta?.safePersist === true && query.state.status === 'success'
}

/**
 * Owner scoping (M3.5). The persisted payload is wrapped as
 * `{ ownerId, client }` so a shared-device handoff (user A's cache on disk,
 * user B signs in) can be detected and the cache dropped instead of briefly
 * rendering A's data under B.
 *
 * Tradeoff / why not a per-user storage key: the restore runs at boot, before
 * auth resolves, and AsyncStorage is async — there is no synchronously-known
 * user id to build a key from without delaying restore behind an extra storage
 * read (defeating the fast-boot purpose of the persisted cache). So we keep
 * the fixed key + eager restore and validate ownership instead, twice:
 *   1. at deserialize time, when auth happened to resolve first
 *      (`currentCacheOwnerId` already known) — mismatch restores an empty,
 *      already-expired client;
 *   2. in `AuthGatedCacheReset` (QueryProvider) when auth resolves after the
 *      restore — mismatch clears the in-memory cache and the disk payload.
 * Payloads persisted before auth resolves (or legacy un-tagged payloads) carry
 * `ownerId: null` = "unknown"; those are restored and never force-cleared,
 * which matches the previous behavior.
 */
type OwnerTaggedPersistedClient = {
  ownerId: string | null
  client: PersistedClient
}

let currentCacheOwnerId: string | null = null
/** `undefined` = nothing restored (yet); `null` = restored but owner unknown. */
let restoredCacheOwnerId: string | null | undefined

/** Called by AuthGatedCacheReset whenever the authenticated user changes. */
export function setPersistedQueryCacheOwner(userId: string | null): void {
  currentCacheOwnerId = userId
}

export function getRestoredQueryCacheOwnerId(): string | null | undefined {
  return restoredCacheOwnerId
}

/** Empty client stamped in the past so PersistQueryClient discards it as expired. */
function expiredEmptyPersistedClient(): PersistedClient {
  return {
    buster: '',
    timestamp: 0,
    clientState: { mutations: [], queries: [] },
  }
}

export function createMobileQueryPersister(): Persister {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: MOBILE_QUERY_STORAGE_KEY,
    throttleTime: 1_000,
    serialize: (client) =>
      JSON.stringify({
        ownerId: currentCacheOwnerId,
        client,
      } satisfies OwnerTaggedPersistedClient),
    deserialize: (cached) => {
      const parsed = JSON.parse(cached) as OwnerTaggedPersistedClient | PersistedClient
      if (parsed && typeof parsed === 'object' && 'client' in parsed && 'ownerId' in parsed) {
        const tagged = parsed as OwnerTaggedPersistedClient
        restoredCacheOwnerId = tagged.ownerId
        if (
          typeof tagged.ownerId === 'string' &&
          currentCacheOwnerId !== null &&
          tagged.ownerId !== currentCacheOwnerId
        ) {
          // Auth already resolved to a different user: refuse the payload.
          void clearPersistedQueryCache()
          return expiredEmptyPersistedClient()
        }
        return tagged.client
      }
      // Legacy (pre-M3.5) un-wrapped payload — owner unknown.
      restoredCacheOwnerId = null
      return parsed as PersistedClient
    },
  })
}

/** Nuke the persisted cache file. Used on sign-out to avoid leaking data. */
export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MOBILE_QUERY_STORAGE_KEY)
  } catch {
    // ignore – best-effort
  }
}

/** @deprecated Use PersistQueryClientProvider + createMobileQueryPersister instead. */
export function startQueryPersistence(): { unsubscribe: () => void } {
  return { unsubscribe: () => undefined }
}

export { MOBILE_APP_BUILD_ID as APP_BUILD_ID }
