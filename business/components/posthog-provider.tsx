"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { initPostHog, getPostHog } from "@/lib/posthog"
import { scheduleAfterIdle } from "@/lib/schedule-after-idle"

export function PostHogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [analyticsReady, setAnalyticsReady] = useState(false)

  useEffect(() => {
    return scheduleAfterIdle(() => {
      initPostHog()
      setAnalyticsReady(true)
    })
  }, [])

  useEffect(() => {
    if (!analyticsReady || typeof window === "undefined" || !pathname) return
    const posthog = getPostHog()
    posthog.capture("$pageview", {
      $current_url: window.location.href,
      platform: "business_web",
      environment: process.env.NODE_ENV,
    })
  }, [analyticsReady, pathname])

  return <>{children}</>
}
