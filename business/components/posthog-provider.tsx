"use client"

import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { ANALYTICS_PLATFORM } from "@easner/shared"
import { isCustomerAppHostname } from "@/lib/customer-hosts"
import { getPostHog } from "@/lib/posthog"
import { pageviewProperties } from "@/lib/posthog-attribution"

export function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <PageviewTracker />
      {children}
    </>
  )
}

/**
 * Leaf component: `usePathname()` re-renders its host on every navigation,
 * so it must not live in the provider that wraps the whole app.
 *
 * Initial `$pageview` is captured by `capture_pageview: true` at init (before
 * hydration). This tracker only fires on subsequent SPA route changes.
 */
function PageviewTracker() {
  const pathname = usePathname()
  const skipInitial = useRef(true)

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return
    if (skipInitial.current) {
      skipInitial.current = false
      return
    }
    const posthog = getPostHog()
    const platform = isCustomerAppHostname(window.location.hostname)
      ? ANALYTICS_PLATFORM.payerWeb
      : ANALYTICS_PLATFORM.businessWeb
    posthog.capture("$pageview", {
      ...pageviewProperties(window.location.href, document.referrer),
      platform,
      environment: process.env.NODE_ENV,
    })
  }, [pathname])

  return null
}
