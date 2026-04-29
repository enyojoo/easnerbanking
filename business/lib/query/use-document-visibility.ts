"use client"

import { useEffect, useState } from "react"

/**
 * True when the browser tab is visible. Pauses polling-heavy refetch intervals
 * while backgrounded to cut redundant `/api/*` traffic.
 */
export function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  )
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden)
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])
  return visible
}
