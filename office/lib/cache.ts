interface CacheItem<T> {
  data: T
  timestamp: number
  ttl: number
  isStale?: boolean
}

class DataCache {
  private cache = new Map<string, CacheItem<unknown>>()
  private readonly DEFAULT_TTL = 60 * 60 * 1000 // 60 minutes
  private readonly STALE_WHILE_REVALIDATE_TTL = 24 * 60 * 60 * 1000 // 24 hours
  private refreshPromises = new Map<string, Promise<unknown>>()

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl, isStale: false })
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key)
    if (!item) return null

    const now = Date.now()
    const age = now - item.timestamp

    if (age > this.STALE_WHILE_REVALIDATE_TTL) {
      this.cache.delete(key)
      return null
    }

    if (age > item.ttl) item.isStale = true
    return item.data as T
  }

  isStale(key: string): boolean {
    const item = this.cache.get(key)
    if (!item) return true
    return Date.now() - item.timestamp > item.ttl
  }

  getWithRefresh<T>(key: string, refreshFn: () => Promise<T>): T | null {
    const data = this.get<T>(key)
    if (data && this.isStale(key) && !this.refreshPromises.has(key)) {
      this.refreshPromises.set(
        key,
        refreshFn()
          .then((freshData) => {
            this.set(key, freshData)
            return freshData
          })
          .catch((error) => {
            console.error(`Background refresh failed for ${key}:`, error)
            return data
          })
          .finally(() => {
            this.refreshPromises.delete(key)
          }),
      )
    }
    return data
  }

  invalidate(key: string): void {
    this.cache.delete(key)
    this.refreshPromises.delete(key)
  }

  clear(): void {
    this.cache.clear()
    this.refreshPromises.clear()
  }
}

export const dataCache = new DataCache()

export const CACHE_KEYS = {
  OFFICE_DATA: "office_data",
  COMMERCIAL_LIMITS: "commercial_limits",
  COMMERCIAL_PLANS: "commercial_plans",
  COMMERCIAL_RULES: "commercial_rules",
  COMMERCIAL_SUBSCRIPTIONS: "commercial_subscriptions",
  COMMERCIAL_METRICS: "commercial_metrics",
} as const
