import React, { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { pageviewProperties } from '@easner/shared'
import { schedulePostHogBootInit } from '../lib/posthog'
import { analytics } from '../lib/analytics'

interface PostHogProviderProps {
  children: React.ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  React.useEffect(() => {
    if (Platform.OS !== 'web') {
      schedulePostHogBootInit()
    }
  }, [])

  return (
    <>
      {Platform.OS === 'web' ? <WebPageviewTracker /> : null}
      {children}
    </>
  )
}

/** Fires SPA $pageview on Expo web route changes (landing handled at init). */
function WebPageviewTracker() {
  const skipInitial = useRef(true)
  const lastHref = useRef(typeof window !== 'undefined' ? window.location.href : '')

  useEffect(() => {
    if (typeof window === 'undefined') return

    const captureIfChanged = () => {
      const href = window.location.href
      if (href === lastHref.current) return
      lastHref.current = href
      if (skipInitial.current) {
        skipInitial.current = false
        return
      }
      const props = pageviewProperties(href, document.referrer)
      analytics.trackWebPageView(props.$current_url, props.$referrer, {
        $referring_domain: props.$referring_domain,
      })
    }

    const onPopState = () => captureIfChanged()
    window.addEventListener('popstate', onPopState)

    const interval = window.setInterval(captureIfChanged, 500)

    return () => {
      window.removeEventListener('popstate', onPopState)
      window.clearInterval(interval)
    }
  }, [])

  return null
}
