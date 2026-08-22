import React from 'react'
import { getApplePayMerchantId } from '../lib/apple-pay-merchant'

type Props = {
  children: React.ReactNode
  publishableKey?: string | null
}

export function ExpressStripeProvider({ children, publishableKey }: Props) {
  if (!publishableKey) return <>{children}</>
  try {
    const { StripeProvider } = require('@stripe/stripe-react-native') as {
      StripeProvider: React.ComponentType<{
        children: React.ReactNode
        publishableKey: string
        merchantIdentifier?: string
      }>
    }
    return (
      <StripeProvider publishableKey={publishableKey} merchantIdentifier={getApplePayMerchantId()}>
        {children}
      </StripeProvider>
    )
  } catch {
    return <>{children}</>
  }
}
