"use client"

import { useEffect } from "react"
import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { initPostHog, getPostHog } from "@/lib/posthog"

export function PostHogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    initPostHog()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return
    const posthog = getPostHog()
    posthog.capture("$pageview", {
      $current_url: window.location.href,
      platform: "business_web",
      environment: process.env.NODE_ENV,
    })
  }, [pathname])

  return <>{children}</>
}
