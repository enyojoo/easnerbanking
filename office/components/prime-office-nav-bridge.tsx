"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useOfficeAdminEnabled } from "@/hooks/queries/use-office-admin-enabled"

/**
 * Kicks off `primeOfficeNav` once the signed-in admin is confirmed, so every
 * sidebar destination opens with its data already in the query cache.
 *
 * The primer module is imported lazily to keep it (and the api modules it
 * pulls in) out of the shell's first-paint bundle. Re-runs are cheap:
 * `primeOfficeNav` guards with an in-flight flag and every prefetch respects
 * its query's own staleTime, so a warm cache makes the whole pass a no-op.
 */
export function PrimeOfficeNavBridge() {
  const { enabled } = useOfficeAdminEnabled()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void import("@/lib/query/prime-office-nav").then((m) => {
      if (!cancelled) void m.primeOfficeNav(queryClient)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, queryClient])

  return null
}
