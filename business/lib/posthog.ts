"use client"

import posthog from "posthog-js"

let initialized = false

export function initPostHog() {
  if (initialized || typeof window === "undefined") return posthog

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

  if (!posthogKey || !posthogHost) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("PostHog not initialized: missing NEXT_PUBLIC_POSTHOG_KEY or NEXT_PUBLIC_POSTHOG_HOST")
    }
    return posthog
  }

  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: false,
    capture_pageleave: true,
    cross_subdomain_cookie: false,
    secure_cookie: true,
  })

  initialized = true
  return posthog
}

export function getPostHog() {
  return posthog
}
