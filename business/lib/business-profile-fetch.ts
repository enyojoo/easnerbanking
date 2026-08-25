"use client"

import { fetchWithSession } from "@/lib/fetch-with-session"

/**
 * Single-flight `GET /api/business/profile`.
 *
 * Boot used to fire this request up to three times concurrently (scope
 * resolution, the profile hook's fetcher, and `refreshProfile`) — and it's
 * the request the whole workspace gates on. Concurrent callers now share one
 * round trip; the slot is released after settle so later explicit refreshes
 * still hit the network.
 */
export type BusinessProfileEnvelope = {
  profile?: ({ businessId?: string | null } & Record<string, unknown>) | null
}

let inflight: Promise<BusinessProfileEnvelope | null> | null = null

export function fetchBusinessProfileEnvelope(): Promise<BusinessProfileEnvelope | null> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetchWithSession("/api/business/profile")
        if (!res.ok) return null
        return (await res.json().catch(() => null)) as BusinessProfileEnvelope | null
      } catch {
        return null
      } finally {
        setTimeout(() => {
          inflight = null
        }, 0)
      }
    })()
  }
  return inflight
}
