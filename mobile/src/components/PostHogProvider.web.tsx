import React from 'react'

interface PostHogProviderProps {
  children: React.ReactNode
}

/** Web uses posthog-js (see posthog.web.ts). Do not pass that client to the RN provider. */
export function PostHogProvider({ children }: PostHogProviderProps) {
  return <>{children}</>
}
