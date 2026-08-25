"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { initPostHog, getPostHog } from "@/lib/posthog"
import { scheduleAfterIdle } from "@/lib/schedule-after-idle"

export function PostHogProvider({ children }: { children: ReactNode }) {
  const [analyticsReady, setAnalyticsReady] = useState(false)

  useEffect(() => {
    return scheduleAfterIdle(() => {
      initPostHog()
      setAnalyticsReady(true)
    })
  }, [])

  return (
    <>
      {analyticsReady ? <PageviewTracker /> : null}
      {children}
    </>
  )
}

/**
 * Leaf component: `usePathname()` re-renders its host on every navigation,
 * so it must not live in the provider that wraps the whole app.
 */
function PageviewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return
    const posthog = getPostHog()
    posthog.capture("$pageview", {
      $current_url: window.location.href,
      platform: "business_web",
      environment: process.env.NODE_ENV,
    })
  }, [pathname])

  return null
}
