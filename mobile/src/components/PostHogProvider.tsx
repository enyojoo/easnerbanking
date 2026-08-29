import React from 'react'
import { PostHogProvider as PostHogSDKProvider } from 'posthog-react-native'
import { getPostHog } from '../lib/posthog'

interface PostHogProviderProps {
  children: React.ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const client = getPostHog()

  if (!client) {
    return <>{children}</>
  }

  return (
    <PostHogSDKProvider client={client} autocapture={false} debug={__DEV__}>
      {children}
    </PostHogSDKProvider>
  )
}
