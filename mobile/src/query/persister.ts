import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'
import type { QueryClient } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'

/**
 * Disk persistence policy for Easner mobile.
 *
 * Only queries explicitly tagged `meta.safePersist === true` are written to
 * AsyncStorage. Balances, session-scoped data, and anything money-sensitive
 * MUST NOT set `safePersist`; they live in memory only.
 *
 * The persister is bucketed by `APP_BUILD_ID` so a shipped schema change
 * invalidates every cached payload in a single release — readers never see
 * a shape mismatch between old persisted data and new code.
 */

const APP_BUILD_ID =
  // Native build number is the most stable rev for shipped apps.
  (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
  (Constants.expoConfig?.android?.versionCode?.toString() as string | undefined) ??
  Constants.expoConfig?.version ??
  '0'

const STORAGE_KEY = 'easner.query.cache.v2'

function makePersister(): Persister {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: STORAGE_KEY,
    // Keep payloads compact; React Native's JSI bridge doesn't love MBs.
    throttleTime: 1_000,
  })
}

export type PersistenceHandle = {
  unsubscribe: () => void
}

export function startQueryPersistence(qc: QueryClient): PersistenceHandle {
  const persister = makePersister()
  const [unsubscribe] = persistQueryClient({
    queryClient: qc,
    persister,
    maxAge: 7 * 24 * 60 * 60_000, // 7 days; anything older is refetched.
    buster: APP_BUILD_ID,
    dehydrateOptions: {
      // Do not persist pending/loading states; rehydrating them can replay a
      // request before auth is ready and emit noisy unauthorized rejections.
      shouldDehydrateQuery: (q) => q.meta?.safePersist === true && q.state.status === 'success',
      shouldDehydrateMutation: () => false,
    },
    // Persisted rows are shown immediately. `staleTime: 0` isn't accepted in
    // the hydrate options type in v5; instead we mark the persisted queries
    // stale via the per-query `staleTime` in each hook, so the first
    // realtime/network event upgrades them in place.
  })
  return { unsubscribe }
}

/** Nuke the persisted cache file. Used on sign-out to avoid leaking data. */
export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore — best-effort
  }
}

export { STORAGE_KEY as MOBILE_QUERY_STORAGE_KEY, APP_BUILD_ID as MOBILE_APP_BUILD_ID }

// Helper placeholder to satisfy ts-check when PersistedClient is unused;
// real callers only need `startQueryPersistence`.
export type { PersistedClient }
