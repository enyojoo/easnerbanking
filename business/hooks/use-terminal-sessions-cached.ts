"use client"

import { useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"
import { fetchWithSession } from "@/lib/fetch-with-session"

export type TerminalSessionListItem = {
  id: string
  status: string
  fiat_amount: string | number
  fiat_currency: string
  crypto_currency: string
  network: string
  destination_address: string | null
  created_at: string
}

/** Shorter TTL than profile: session status changes; still SWR on focus via useCachedData. */
export const TERMINAL_SESSIONS_CACHE_TTL_MS = 5 * 60 * 1000

async function fetchTerminalSessions(): Promise<TerminalSessionListItem[]> {
  const res = await fetchWithSession("/api/terminal/sessions")
  const body = (await res.json().catch(() => ({}))) as {
    sessions?: TerminalSessionListItem[]
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error || "Failed to load terminal sessions")
  }
  return body.sessions ?? []
}

export function useTerminalSessionsCached() {
  const { user, isLoading } = useAuth()

  const fetcher = useCallback(() => fetchTerminalSessions(), [])

  return useCachedData<TerminalSessionListItem[]>({
    enabled: Boolean(user?.id) && !isLoading,
    cacheKey: user?.id ? CACHE_KEYS.TERMINAL_SESSIONS(user.id) : null,
    persistKey: user?.id ? `terminal_sessions_cache_${user.id}` : undefined,
    initialData: [],
    ttlMs: TERMINAL_SESSIONS_CACHE_TTL_MS,
    fetcher,
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Terminal sessions load failed:", message)
    },
  })
}
