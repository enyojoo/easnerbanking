"use client"

import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { dataCache, CACHE_KEYS } from "@/lib/cache"
import type { BusinessProfile } from "@/lib/use-business-profile"

type StoreData = {
  profile: BusinessProfile
  lastUpdated: number
}

/** After this age we still show cached profile in the UI but revalidate in the background */
const CACHE_TTL_MS = 5 * 60 * 1000

/** Drop localStorage snapshots older than this (avoid stale forever) */
const LS_DISPLAY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function cacheKey(userId: string) {
  return `business_profile_cache_${userId}`
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

class BusinessProfileStore {
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
        console.error("BusinessProfileStore listener error:", e)
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
    const age = Date.now() - parsed.timestamp
    if (age > LS_DISPLAY_MAX_AGE_MS) return null
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
    if (!data.session) throw new Error("No session")

    const res = await fetchWithSession("/api/business/profile")
    if (!res.ok) throw new Error("Failed to load profile")

    const json = (await res.json()) as { profile?: BusinessProfile }
    if (!json.profile) throw new Error("Missing profile")

    const next: StoreData = { profile: json.profile, lastUpdated: Date.now() }
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
            dataCache.set(CACHE_KEYS.BUSINESS_PROFILE(userId), fresh, CACHE_TTL_MS)
            return fresh
          })
          .catch((err) => {
            console.error("Business profile background refresh failed:", err)
            if (this.data) return this.data
            throw err
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
        dataCache.set(CACHE_KEYS.BUSINESS_PROFILE(userId), fresh, CACHE_TTL_MS)
        return fresh
      })
      .finally(() => {
        this.loadingPromise = null
      })

    return this.loadingPromise
  }

  invalidate(userId: string) {
    dataCache.invalidate(CACHE_KEYS.BUSINESS_PROFILE(userId))
    if (this.currentUserId === userId) {
      // keep last data, just mark it as stale by backdating lastUpdated
      if (this.data) this.data.lastUpdated = 0
    }
  }

  /**
   * Synchronously restore profile from localStorage before paint (full reload / new tab).
   * Safe to call multiple times.
   */
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
      dataCache.set(CACHE_KEYS.BUSINESS_PROFILE(userId), ls, CACHE_TTL_MS)
      this.notify()
    }
  }

}

export const businessProfileStore = new BusinessProfileStore()

