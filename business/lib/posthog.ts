"use client"

import type { PostHog } from "posthog-js"

/**
 * posthog-js is ~67 KB gzip; a static import here lands it in the root-layout
 * bundle of every page. The module is loaded with a dynamic import inside
 * `initPostHog()` instead, and `getPostHog()` hands out a stub that queues
 * calls until the real client is ready — call sites are unchanged.
 */

type AnalyticsClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void
  identify: (userId: string, properties?: Record<string, unknown>) => void
  reset: () => void
}

const MAX_QUEUED_CALLS = 100

let client: PostHog | null = null
let initStarted = false
let disabled = false
let queue: Array<(posthog: PostHog) => void> = []

function enqueue(call: (posthog: PostHog) => void) {
  if (client) {
    call(client)
    return
  }
  if (disabled || queue.length >= MAX_QUEUED_CALLS) return
  queue.push(call)
}

const lazyClient: AnalyticsClient = {
  capture: (event, properties) => enqueue((posthog) => posthog.capture(event, properties)),
  identify: (userId, properties) => enqueue((posthog) => posthog.identify(userId, properties)),
  reset: () => enqueue((posthog) => posthog.reset()),
}

export function initPostHog(): AnalyticsClient {
  if (initStarted || typeof window === "undefined") return lazyClient
  initStarted = true

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

  if (!posthogKey || !posthogHost) {
    disabled = true
    queue = []
    if (process.env.NODE_ENV !== "production") {
      console.warn("PostHog not initialized: missing NEXT_PUBLIC_POSTHOG_KEY or NEXT_PUBLIC_POSTHOG_HOST")
    }
    return lazyClient
  }

  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        capture_pageview: false,
        capture_pageleave: true,
        cross_subdomain_cookie: false,
        secure_cookie: true,
      })
      client = posthog
      for (const call of queue.splice(0)) call(posthog)
    })
    .catch(() => {
      disabled = true
      queue = []
    })

  return lazyClient
}

export function getPostHog(): AnalyticsClient {
  return client ?? lazyClient
}
