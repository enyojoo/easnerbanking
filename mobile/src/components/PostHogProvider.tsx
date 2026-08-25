import React from 'react'
import { schedulePostHogBootInit } from '../lib/posthog'

interface PostHogProviderProps {
  children: React.ReactNode
}

/**
 * Boot shim for PostHog. Nothing in the app consumes the posthog-react-native
 * React context (`usePostHog` etc.) — all analytics go through `getPostHog()`
 * — so wrapping the tree in the SDK provider only forced eager client
 * construction (session-replay remote-config fetch + storage loads) on the
 * boot critical path. Client creation is deferred until boot interactions
 * settle; any earlier analytics call creates it on demand.
 */
export function PostHogProvider({ children }: PostHogProviderProps) {
  React.useEffect(() => {
    schedulePostHogBootInit()
  }, [])

  return <>{children}</>
}
