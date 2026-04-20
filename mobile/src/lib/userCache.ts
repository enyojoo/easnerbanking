/**
 * User-scoped AsyncStorage cache helpers (plaintext — do not store PAN, secrets, or tokens).
 *
 * ## TTL policy (ms)
 * | Domain | TTL | Rationale |
 * |--------|-----|-----------|
 * | Combined / dashboard tx feeds | 60s | Financially sensitive, stale-while-revalidate |
 * | Context transactions (Noah list) | 60s | Same |
 * | Exchange rates | 5m | Volatile FX |
 * | Transaction detail | 10m | Rarely changes after settlement |
 * | Communication prefs | 5m | Settings; PATCH updates cache |
 * | Profile row (`AuthUser`) | n/a TTL | [`profileSnapshot.ts`](./profileSnapshot.ts) — instant header; refreshed with profile fetch |
 * | Recipients | 60m | Low-volatility directory |
 * | Payment methods | 60m | Metadata |
 * | Currencies | 24h | Rarely changes |
 *
 * ## Invalidate when
 * - User **logout**: remove all keys for that `userId` (see `clearAllUserCachesForUserId`).
 * - **Mutations**: recipient CRUD → recipients + optional feeds; send/receive success → bust financial feeds (`bustFinancialFeedCaches`).
 * - **Settings PATCH**: writers update disk row for that resource.
 *
 * Wire format: `{ data: T; timestamp: number }` (ISO-safe via Date.now()).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { clearProfileSnapshot } from './profileSnapshot'

/** Canonical TTLs — single source of truth for SWR windows. */
export const CacheTTL = {
  CURRENCIES: 24 * 60 * 60 * 1000,
  EXCHANGE_RATES: 5 * 60 * 1000,
  RECIPIENTS: 60 * 60 * 1000,
  /** Legacy Noah transaction list cache key (TanStack lists use query cache now). */
  CONTEXT_TRANSACTIONS: 60 * 1000,
  PAYMENT_METHODS: 60 * 60 * 1000,
  /** Dashboard Noah combined feed (recent list). */
  DASHBOARD_COMBINED_TX: 60 * 1000,
  /** Full history combined feed (`TransactionsScreen`). */
  COMBINED_TX_LIST: 60 * 1000,
  TRANSACTION_DETAIL: 10 * 60 * 1000,
  COMMUNICATION_PREFS: 5 * 60 * 1000,
} as const

export type CachedEnvelope<T> = {
  data: T
  timestamp: number
}

export type UserCacheSegment =
  | 'currencies'
  | 'exchangeRates'
  | 'recipients'
  | 'contextTransactions'
  | 'paymentMethods'
  | 'dashboardCombinedTx'
  | 'combinedTxList'
  | 'communicationPrefs'

/** Build storage key. `currencies` / `exchangeRates` use `userId || 'global'`. */
export function buildUserCacheKey(segment: UserCacheSegment, userId?: string | null): string {
  const id = userId || 'global'
  switch (segment) {
    case 'currencies':
      return `easner_currencies_${id}`
    case 'exchangeRates':
      return `easner_exchange_rates_${id}`
    case 'recipients':
      return `easner_recipients_${userId ?? ''}`
    case 'contextTransactions':
      return `easner_transactions_${userId ?? ''}`
    case 'paymentMethods':
      return `easner_payment_methods_${userId ?? ''}`
    case 'dashboardCombinedTx':
      return `easner_dashboard_transactions_${userId ?? ''}`
    case 'combinedTxList':
      return `easner_combined_transactions_${userId ?? ''}`
    case 'communicationPrefs':
      return `easner_communication_prefs_v1_${userId ?? ''}`
  }
}

/** Detail row keyed by transaction id (not user-prefixed). */
export function transactionDetailCacheKey(transactionId: string) {
  return `easner_transaction_details_${transactionId}`
}

export function isCacheStale(lastFetchTime: number | undefined, ttl: number): boolean {
  if (!lastFetchTime) return true
  return Date.now() - lastFetchTime > ttl
}

export async function readUserCache<T>(key: string): Promise<CachedEnvelope<T> | null> {
  try {
    const cached = await AsyncStorage.getItem(key)
    if (!cached) return null
    return JSON.parse(cached) as CachedEnvelope<T>
  } catch {
    return null
  }
}

/** Raw JSON parse for one-off legacy row migration (e.g. `{ preferences, timestamp }`). */
export async function readJsonRaw(key: string): Promise<unknown | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function writeUserCache<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      } satisfies CachedEnvelope<T>),
    )
  } catch (error) {
    console.warn(`[userCache] Error writing ${key}:`, error)
  }
}

export async function removeUserCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** Remove dashboard + full-list combined transaction caches for a user (e.g. after money movement). */
export async function bustFinancialFeedCaches(userId: string): Promise<void> {
  if (!userId) return
  await Promise.all([
    removeUserCache(buildUserCacheKey('dashboardCombinedTx', userId)),
    removeUserCache(buildUserCacheKey('combinedTxList', userId)),
  ])
}

/**
 * Keys cleared on logout (per-user). Transaction-detail keys are per `transactionId` and are not bulk-cleared here.
 */
export function allScopedUserCacheKeys(userId: string): string[] {
  if (!userId) return []
  return [
    buildUserCacheKey('currencies', userId),
    buildUserCacheKey('exchangeRates', userId),
    buildUserCacheKey('recipients', userId),
    buildUserCacheKey('contextTransactions', userId),
    buildUserCacheKey('paymentMethods', userId),
    buildUserCacheKey('dashboardCombinedTx', userId),
    buildUserCacheKey('combinedTxList', userId),
    buildUserCacheKey('communicationPrefs', userId),
  ]
}

export async function clearAllUserCachesForUserId(userId: string): Promise<void> {
  const keys = allScopedUserCacheKeys(userId)
  try {
    if (keys.length > 0) {
      await AsyncStorage.multiRemove(keys)
    }
  } catch {
    // ignore
  }
  await clearProfileSnapshot(userId)
}
