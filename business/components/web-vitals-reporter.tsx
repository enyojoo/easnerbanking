"use client"

import { useEffect } from "react"
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

  return null
}
