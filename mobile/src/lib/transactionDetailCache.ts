/**
 * Per-transaction detail disk cache (see `CacheTTL.TRANSACTION_DETAIL` in userCache.ts).
 */
import {
  CacheTTL,
  isCacheStale,
  readUserCache,
  transactionDetailCacheKey,
  writeUserCache,
} from './userCache'

export async function readCachedTransactionDetail<T>(transactionId: string): Promise<T | null> {
  if (!transactionId.trim()) return null
  const cached = await readUserCache<T>(transactionDetailCacheKey(transactionId))
  if (!cached || isCacheStale(cached.timestamp, CacheTTL.TRANSACTION_DETAIL)) return null
  return cached.data
}

export async function writeCachedTransactionDetail<T>(
  transactionId: string,
  data: T,
): Promise<void> {
  if (!transactionId.trim()) return
  await writeUserCache(transactionDetailCacheKey(transactionId), data)
}
