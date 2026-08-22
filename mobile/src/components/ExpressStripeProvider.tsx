import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getApplePayMerchantId } from '../lib/apple-pay-merchant'
import {
  fetchExpressOnrampStatus,
  peekExpressOnrampStatus,
  subscribeExpressOnrampStatus,
} from '../lib/expressOnrampStatusCache'
import { ExpressOnrampNativeBridge } from './ExpressOnrampNativeBridge'

type Props = {
  children: React.ReactNode
  publishableKey?: string | null
}

export function ExpressStripeProvider({ children, publishableKey }: Props) {
  const { user } = useAuth()
  const [pk, setPk] = useState(
    () => publishableKey || peekExpressOnrampStatus()?.publishableKey || null,
  )

  useEffect(() => {
    if (publishableKey) setPk(publishableKey)
  }, [publishableKey])

  useEffect(() => {
    return subscribeExpressOnrampStatus(() => {
      const next = peekExpressOnrampStatus()?.publishableKey
      if (next) setPk(next)
    })
  }, [])

  useEffect(() => {
    if (!user?.id) return
    void fetchExpressOnrampStatus(true)
      .then((data) => {
        if (data.publishableKey) setPk(data.publishableKey)
      })
      .catch(() => undefined)
  }, [user?.id])

  // Keep navigation mounted. Only the onramp bridge needs StripeProvider.
  let stripe: React.ReactNode = null
  if (pk) {
    try {
      const { StripeProvider } = require('@stripe/stripe-react-native') as {
        StripeProvider: React.ComponentType<{
          children: React.ReactNode
          publishableKey: string
          merchantIdentifier?: string
        }>
      }
      stripe = (
        <StripeProvider
          publishableKey={pk}
          merchantIdentifier={getApplePayMerchantId()}
          urlScheme="easner"
        >
          <ExpressOnrampNativeBridge />
        </StripeProvider>
      )
    } catch {
      stripe = null
    }
  }

  return (
    <>
      {stripe}
      {children}
    </>
  )
}
