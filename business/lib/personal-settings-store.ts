"use client"

import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { dataCache, CACHE_KEYS } from "@/lib/cache"

export type PersonalSettings = {
  fullName: string
  email: string
  phone: string
  dateOfBirth: string
  /** Data URL or URL from auth user_metadata */
  avatarUrl: string | null
}

type StoreData = {
  personal: PersonalSettings
  lastUpdated: number
}

const CACHE_TTL_MS = 5 * 60 * 1000
const LS_DISPLAY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function cacheKey(userId: string) {
  return `personal_settings_cache_${userId}`
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

class PersonalSettingsStore {
  private data: StoreData | null = null
  private currentUserId: string | null = null
  private loadingPromise: Promise<StoreData> | null = null
  private listeners = new Set<() => void>()

  subscribe(cb: () => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb()
      } catch (e) {
        console.error("PersonalSettingsStore listener error:", e)
      }
    })
  }

  getData() {
    return this.data
  }

  isFresh(): boolean {
    if (!this.data) return false
    return Date.now() - this.data.lastUpdated < CACHE_TTL_MS
  }

  private loadFromLocalStorage(userId: string): StoreData | null {
    if (typeof window === "undefined") return null
    const raw = localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed = safeParse<{ data: StoreData; timestamp: number }>(raw)
    if (!parsed) return null
    if (Date.now() - parsed.timestamp > LS_DISPLAY_MAX_AGE_MS) return null
    return parsed.data
  }

  private saveToLocalStorage(userId: string, data: StoreData) {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(cacheKey(userId), JSON.stringify({ data, timestamp: Date.now() }))
    } catch {
      // ignore
    }
  }

  private async refresh(userId: string): Promise<StoreData> {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error("No session")

    const res = await fetch("/api/settings/personal", { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error("Failed to load personal settings")

    const json = (await res.json()) as {
      personal?: Partial<PersonalSettings>
      sessionRefreshSuggested?: boolean
    }
    if (json.sessionRefreshSuggested) {
      await supabase.auth.refreshSession()
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("business-profile-updated"))
      }
    }
    const p = json.personal ?? {}
    const next: StoreData = {
      personal: {
        fullName: p.fullName ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        dateOfBirth: p.dateOfBirth ?? "",
        avatarUrl: typeof p.avatarUrl === "string" && p.avatarUrl.trim() ? p.avatarUrl : null,
      },
      lastUpdated: Date.now(),
    }

    this.data = next
    this.saveToLocalStorage(userId, next)
    this.notify()
    return next
  }

  async initialize(userId: string) {
    this.hydrateSync(userId)

    if (this.data && this.isFresh()) {
      return this.data
    }

    if (this.data && !this.isFresh()) {
      if (!this.loadingPromise) {
        this.loadingPromise = this.refresh(userId)
          .then((fresh) => {
            dataCache.set(CACHE_KEYS.PERSONAL_SETTINGS(userId), fresh, CACHE_TTL_MS)
            return fresh
          })
          .catch((err) => {
            console.error("Personal settings background refresh failed:", err)
          })
          .finally(() => {
            this.loadingPromise = null
          })
      }
      return this.data
    }

    if (this.loadingPromise && this.currentUserId === userId) {
      return this.loadingPromise
    }

    this.loadingPromise = this.refresh(userId)
      .then((fresh) => {
        dataCache.set(CACHE_KEYS.PERSONAL_SETTINGS(userId), fresh, CACHE_TTL_MS)
        return fresh
      })
      .finally(() => {
        this.loadingPromise = null
      })

    return this.loadingPromise
  }

  invalidate(userId: string) {
    dataCache.invalidate(CACHE_KEYS.PERSONAL_SETTINGS(userId))
    if (this.currentUserId === userId && this.data) this.data.lastUpdated = 0
  }

  hydrateSync(userId: string): void {
    if (typeof window === "undefined" || !userId) return
    if (this.currentUserId !== userId) {
      this.data = null
    }
    this.currentUserId = userId
    if (this.data) return
    const ls = this.loadFromLocalStorage(userId)
    if (ls) {
      this.data = ls
      dataCache.set(CACHE_KEYS.PERSONAL_SETTINGS(userId), ls, CACHE_TTL_MS)
      this.notify()
    }
  }
}

export const personalSettingsStore = new PersonalSettingsStore()

