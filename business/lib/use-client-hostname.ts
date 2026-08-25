"use client"

import { useEffect, useState } from "react"

/**
 * Hostname resolved after mount, `null` during SSR and the hydration render.
 *
 * The root layout must NOT read `headers()` for this: doing so opts every
 * route into dynamic rendering, which breaks router prefetching app-wide (a
 * dynamic route with no loading boundary prefetches nothing, so every nav
 * blocks on a server round trip). Surface selection uses pathname heuristics
 * for the first paint — which already recognize customer-host URL shapes —
 * and tightens with the real hostname immediately after mount.
 */
export function useClientHostname(): string | null {
  const [hostname, setHostname] = useState<string | null>(null)
  useEffect(() => {
    setHostname(window.location.hostname)
  }, [])
  return hostname
}
