import React from 'react'

type Props = {
  children: React.ReactNode
  publishableKey?: string | null
}

export function ExpressStripeProvider({ children }: Props) {
  return <>{children}</>
}
