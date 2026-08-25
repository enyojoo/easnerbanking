"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { scheduleAfterIdle } from "@/lib/schedule-after-idle"
import { getPostHog } from "@/lib/posthog"

type WebVitalMetric = {
  name: string
  value: number
  rating: "good" | "needs-improvement" | "poor"
  id: string
  navigationType?: string
}

function captureWebVital(metric: WebVitalMetric) {
  const posthog = getPostHog()
  if (!posthog?.capture) return
  posthog.capture("web_vital", {
    metric_name: metric.name,
    metric_value: metric.value,
    metric_rating: metric.rating,
    metric_id: metric.id,
    navigation_type: metric.navigationType,
    platform: "business_web",
  })
}

/** Non-blocking Core Web Vitals RUM via PostHog (after analytics init). */
export function WebVitalsReporter() {
  useEffect(() => {
    return scheduleAfterIdle(() => {
      void import("web-vitals").then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
        onCLS(captureWebVital)
        onFCP(captureWebVital)
        onINP(captureWebVital)
        onLCP(captureWebVital)
        onTTFB(captureWebVital)
      })
    }, 3000)
  }, [])

  return <RouteTransitionReporter />
}

/**
 * Instant-standard metric (docs/speed-ux-plan.md, Phase B0): time from the
 * click on an internal link to the destination route's content committing
 * (double-rAF after the pathname change ≈ first painted frame). Target:
 * < 100ms warm. Reported as `route_transition` so regressions show up in
 * PostHog rather than in user complaints.
 */
function RouteTransitionReporter() {
  const pathname = usePathname()
  const clickAtRef = useRef<number | null>(null)
  const lastPathnameRef = useRef(pathname)

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as Element | null
      const anchor = target?.closest?.('a[href^="/"]')
      if (anchor) clickAtRef.current = performance.now()
    }
    window.addEventListener("click", onClickCapture, { capture: true, passive: true })
    return () => window.removeEventListener("click", onClickCapture, { capture: true })
  }, [])

  useEffect(() => {
    if (pathname === lastPathnameRef.current) return
    const from = lastPathnameRef.current
    lastPathnameRef.current = pathname
    const clickAt = clickAtRef.current
    clickAtRef.current = null
    if (clickAt == null || !pathname) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const duration = performance.now() - clickAt
        // Ignore stale clicks (e.g. dialog interactions long before a nav).
        if (duration > 30_000) return
        getPostHog().capture("route_transition", {
          duration_ms: Math.round(duration),
          from_path: from,
          to_path: pathname,
          platform: "business_web",
        })
      })
    })
  }, [pathname])

  return null
}
