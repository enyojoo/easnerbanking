"use client"

import posthog from "posthog-js"
import { cleanBrowserAttributionUrl, shouldIdentifyCrossDomainId } from "@/lib/posthog-attribution"

/**
 * Eager client init for first-touch attribution (UTM, referrer, `__ph_id`).
 * Loaded from `instrumentation-client.ts` before hydration — do not defer
 * behind useEffect, idle callbacks, or dynamic import().
 */

type AnalyticsClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void
  identify: (userId: string, properties?: Record<string, unknown>) => void
  reset: () => void
  group: (groupType: string, groupKey: string, properties?: Record<string, unknown>) => void
  register: (properties: Record<string, unknown>) => void
}

const noopClient: AnalyticsClient = {
  capture: () => {},
  identify: () => {},
  reset: () => {},
  group: () => {},
  register: () => {},
}

let initStarted = false
let disabled = false

export function initPostHog(): AnalyticsClient {
  if (typeof window === "undefined") return noopClient
  if (disabled) return noopClient
  if (initStarted) return posthog

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!posthogKey) {
    disabled = true
    if (process.env.NODE_ENV !== "production") {
      console.warn("PostHog not initialized: missing NEXT_PUBLIC_POSTHOG_KEY")
    }
    return noopClient
  }

  initStarted = true
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_API_HOST

  posthog.init(posthogKey, {
    api_host: apiHost,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    cross_subdomain_cookie: true,
    secure_cookie: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask], input, textarea",
    },
    loaded: (ph) => {
      const params = new URLSearchParams(window.location.search)
      const crossDomainId = params.get("__ph_id")
      if (shouldIdentifyCrossDomainId(crossDomainId, ph.get_property("$user_id"))) {
        ph.identify(crossDomainId!)
      }
      cleanBrowserAttributionUrl()
    },
  })

  posthog.register({
    platform: "business_web",
    environment: process.env.NODE_ENV,
  })

  return posthog
}

export function getPostHog(): AnalyticsClient {
  if (typeof window === "undefined" || disabled) return noopClient
  if (!initStarted) initPostHog()
  if (disabled) return noopClient
  return posthog
}

if (typeof window !== "undefined") {
  initPostHog()
}
