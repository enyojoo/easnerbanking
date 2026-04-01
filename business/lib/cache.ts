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

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern)
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
        this.refreshPromises.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
    this.refreshPromises.clear()
  }
}

export const dataCache = new DataCache()

export const CACHE_KEYS = {
  BUSINESS_PROFILE: (userId: string) => `business_profile_${userId}`,
  TEAM_MEMBERS: (userId: string) => `team_members_${userId}`,
  PERSONAL_SETTINGS: (userId: string) => `personal_settings_${userId}`,
  RECIPIENTS: (userId: string) => `recipients_${userId}`,
  /** TOTP MFA status line for Security card (On / Off / error). */
  MFA_SECURITY: (userId: string) => `mfa_security_${userId}`,
} as const

