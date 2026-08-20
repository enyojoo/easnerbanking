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
  /** Email / notification prefs (`GET/PATCH /api/settings/communication`). */
  COMMUNICATION_PREFERENCES: (userId: string) => `communication_preferences_${userId}`,
  /** v2: client rows coerce easetag from `bank_name` when `payee_easetag` is null (legacy rows). */
  RECIPIENTS: (userId: string) => `recipients_v2_${userId}`,
  /** TOTP MFA status line for Security card (On / Off / error). */
  MFA_SECURITY: (userId: string) => `mfa_security_${userId}`,
  /** Terminal hub session list (`GET /api/terminal/sessions`). */
  TERMINAL_SESSIONS: (userId: string) => `terminal_sessions_${userId}`,
  /** Terminal payout list + default (`GET /api/terminal/payouts` + settings). */
  TERMINAL_PAYOUT_SETUP: (userId: string) => `terminal_payout_setup_${userId}`,
  /** QR Pay (autopayout) config list (`GET /api/autopayout`). */
  AUTOPAYOUT_LIST: (userId: string) => `autopayout_list_${userId}`,
  /** QR Pay saved payer wallets (`GET /api/autopayout/payer-wallets`). */
  AUTOPAYOUT_PAYER_WALLETS: (userId: string) => `autopayout_payer_wallets_${userId}`,
  /** Ledger transactions for the business (`GET /api/transactions`). */
  TRANSACTIONS_LIST: (userId: string) => `transactions_list_${userId}`,
  /** Noah wallet balances + VA snapshot for `/accounts` (memory + localStorage in hook). */
  BUSINESS_NOAH_ACCOUNT_SNAPSHOT: (userId: string) => `business_noah_accounts_${userId}`,
  /** Business customer directory (`GET /api/business/customers`; table `business_customers`). */
  BUSINESS_CUSTOMERS: (userId: string) => `business_customers_${userId}`,
  /** B2B invoice list (`GET /api/business/b2b/invoices`). */
  B2B_INVOICES: (userId: string) => `b2b_invoices_${userId}`,
  /** Pay-in details per org user + invoice fiat currency (VA + wallet). */
  INVOICE_PAY_IN: (userId: string, currency: string) =>
    `invoice_pay_in_${userId}_${currency.trim().toUpperCase()}`,
} as const

const BUSINESS_NOAH_ACCOUNTS_LS_PREFIX = "business_noah_accounts_"

export function businessNoahAccountsPersistKey(userId: string): string {
  return `${BUSINESS_NOAH_ACCOUNTS_LS_PREFIX}${userId}`
}

/** Notify listeners (e.g. `useBusinessAccountRows`) to refetch balances without clearing cache. */
export function requestBusinessAccountsRefresh(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("easner-business-accounts-refresh"))
}

/** Fired after terminal payout / settings mutations so dependent UI can sync without waiting for navigation. */
export const EASNER_TERMINAL_PAYOUT_SETUP_UPDATED_EVENT = "easner-terminal-payout-setup-updated" as const

export function notifyTerminalPayoutSetupUpdated(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(EASNER_TERMINAL_PAYOUT_SETUP_UPDATED_EVENT))
}

/** Drop cached snapshot and ask hooks to refetch (e.g. after switching org – rare for same user). */
export function invalidateBusinessNoahAccountsCache(userId: string): void {
  dataCache.invalidate(CACHE_KEYS.BUSINESS_NOAH_ACCOUNT_SNAPSHOT(userId))
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(businessNoahAccountsPersistKey(userId))
  } catch {
    /* ignore */
  }
  requestBusinessAccountsRefresh()
}

