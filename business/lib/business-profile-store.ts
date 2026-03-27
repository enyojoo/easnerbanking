"use client"

import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { dataCache, CACHE_KEYS } from "@/lib/cache"
import type { BusinessProfile } from "@/lib/use-business-profile"

type StoreData = {
  profile: BusinessProfile
  lastUpdated: number
}

const CACHE_TTL_MS = 5 * 60 * 1000

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
    if (age > CACHE_TTL_MS) return null
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

    const res = await fetch("/api/business/profile", { headers: { Authorization: `Bearer ${token}` } })
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
    // Seed from memory cache if available (SWR behavior).
    const cached = dataCache.getWithRefresh(CACHE_KEYS.BUSINESS_PROFILE(userId), () => this.refresh(userId))
    if (cached && (!this.data || this.currentUserId !== userId)) {
      this.data = cached
      this.currentUserId = userId
      this.notify()
    }

    // Fresh in-memory data for the same user: return immediately.
    if (this.currentUserId === userId && this.isFresh()) {
      return this.data
    }

    // Dedupe concurrent loads for the same user.
    if (this.loadingPromise && this.currentUserId === userId) {
      return this.loadingPromise
    }

    this.currentUserId = userId

    // Seed from localStorage instantly (stale OK) before fetching.
    if (!this.data) {
      const ls = this.loadFromLocalStorage(userId)
      if (ls) {
        this.data = ls
        dataCache.set(CACHE_KEYS.BUSINESS_PROFILE(userId), ls, CACHE_TTL_MS)
        this.notify()
      }
    }

    const refreshFn = async () => {
      const fresh = await this.refresh(userId)
      dataCache.set(CACHE_KEYS.BUSINESS_PROFILE(userId), fresh, CACHE_TTL_MS)
      return fresh
    }

    this.loadingPromise = refreshFn().finally(() => {
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
}

export const businessProfileStore = new BusinessProfileStore()

