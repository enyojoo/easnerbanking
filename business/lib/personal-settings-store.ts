"use client"

import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { dataCache, CACHE_KEYS } from "@/lib/cache"

export type PersonalSettings = {
  fullName: string
  email: string
  phone: string
  dateOfBirth: string
}

type StoreData = {
  personal: PersonalSettings
  lastUpdated: number
}

const CACHE_TTL_MS = 5 * 60 * 1000

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
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null
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

    const json = (await res.json()) as { personal?: Partial<PersonalSettings> }
    const p = json.personal ?? {}
    const next: StoreData = {
      personal: {
        fullName: p.fullName ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        dateOfBirth: p.dateOfBirth ?? "",
      },
      lastUpdated: Date.now(),
    }

    this.data = next
    this.saveToLocalStorage(userId, next)
    this.notify()
    return next
  }

  async initialize(userId: string) {
    const cached = dataCache.getWithRefresh(CACHE_KEYS.PERSONAL_SETTINGS(userId), () => this.refresh(userId))
    if (cached && (!this.data || this.currentUserId !== userId)) {
      this.data = cached
      this.currentUserId = userId
      this.notify()
    }

    if (this.currentUserId === userId && this.isFresh()) return this.data
    if (this.loadingPromise && this.currentUserId === userId) return this.loadingPromise

    this.currentUserId = userId

    if (!this.data) {
      const ls = this.loadFromLocalStorage(userId)
      if (ls) {
        this.data = ls
        dataCache.set(CACHE_KEYS.PERSONAL_SETTINGS(userId), ls, CACHE_TTL_MS)
        this.notify()
      }
    }

    const refreshFn = async () => {
      const fresh = await this.refresh(userId)
      dataCache.set(CACHE_KEYS.PERSONAL_SETTINGS(userId), fresh, CACHE_TTL_MS)
      return fresh
    }

    this.loadingPromise = refreshFn().finally(() => {
      this.loadingPromise = null
    })

    return this.loadingPromise
  }

  invalidate(userId: string) {
    dataCache.invalidate(CACHE_KEYS.PERSONAL_SETTINGS(userId))
    if (this.currentUserId === userId && this.data) this.data.lastUpdated = 0
  }
}

export const personalSettingsStore = new PersonalSettingsStore()

