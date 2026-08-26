import { useEffect } from 'react'
import { Platform } from 'react-native'
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals'
import { getPostHog } from '../lib/posthog'
import { ANALYTICS_PLATFORM } from '../lib/analytics'

type WebVitalMetric = {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  id: string
  navigationType?: string
}

function captureWebVital(metric: WebVitalMetric) {
  const posthog = getPostHog()
  if (!posthog?.capture) return
  posthog.capture('web_vital', {
    metric_name: metric.name,
    metric_value: metric.value,
    metric_rating: metric.rating,
    metric_id: metric.id,
    navigation_type: metric.navigationType,
    platform: ANALYTICS_PLATFORM.consumerWeb,
  })
}

export function WebVitalsReporter() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return

    const start = () => {
      onCLS(captureWebVital)
      onFCP(captureWebVital)
      onINP(captureWebVital)
      onLCP(captureWebVital)
      onTTFB(captureWebVital)
    }

    const w = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number
      cancelIdleCallback?: (id: number) => void
    }

    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => start(), { timeout: 3000 })
      return () => w.cancelIdleCallback?.(id)
    }

    const timeout = window.setTimeout(start, 500)
    return () => window.clearTimeout(timeout)
  }, [])

  return null
}
