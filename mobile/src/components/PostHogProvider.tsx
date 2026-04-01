import React, { useEffect } from 'react'
import { initPostHog } from '../lib/posthog'

interface PostHogProviderProps {
  children: React.ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  useEffect(() => {
    // Initialize once at app root. Lifecycle events are handled by SDK config.
    initPostHog()
  }, [])

  return <>{children}</>
}
