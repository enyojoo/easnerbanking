import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import type { Query } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { Persister } from '@tanstack/react-query-persist-client'

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

export function createMobileQueryPersister(): Persister {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: MOBILE_QUERY_STORAGE_KEY,
    throttleTime: 1_000,
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
