"use client"

import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { dataCache, CACHE_KEYS } from "@/lib/cache"

export type TeamMember = {
  id: string
  membershipId?: string
  fullName: string
  email: string
  role: "Owner" | "Admin" | "Member" | "Viewer"
  status?: "active" | "invited"
  isSelf?: boolean
  initials?: string
}

type StoreData = {
  members: TeamMember[]
  canManageMembers: boolean
  lastUpdated: number
}

const CACHE_TTL_MS = 5 * 60 * 1000
const LS_DISPLAY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function cacheKey(userId: string) {
  return `team_members_cache_${userId}`
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

class TeamMembersStore {
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
        console.error("TeamMembersStore listener error:", e)
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
    if (!data.session) throw new Error("No session")

    const res = await fetchWithSession("/api/settings/team")
    if (!res.ok) throw new Error("Failed to load team members")

    const json = (await res.json()) as { members?: TeamMember[]; canManageMembers?: boolean }
    const next: StoreData = {
      members: json.members ?? [],
      canManageMembers: Boolean(json.canManageMembers),
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
            dataCache.set(CACHE_KEYS.TEAM_MEMBERS(userId), fresh, CACHE_TTL_MS)
            return fresh
          })
          .catch((err) => {
            console.error("Team members background refresh failed:", err)
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
        dataCache.set(CACHE_KEYS.TEAM_MEMBERS(userId), fresh, CACHE_TTL_MS)
        return fresh
      })
      .finally(() => {
        this.loadingPromise = null
      })

    return this.loadingPromise
  }

  invalidate(userId: string) {
    dataCache.invalidate(CACHE_KEYS.TEAM_MEMBERS(userId))
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
      dataCache.set(CACHE_KEYS.TEAM_MEMBERS(userId), ls, CACHE_TTL_MS)
      this.notify()
    }
  }
}

export const teamMembersStore = new TeamMembersStore()

