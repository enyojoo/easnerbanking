import React, { useEffect, useRef, useState } from 'react'
import { colors } from '../theme'
import {
  adaptNativeOnramp,
  failNativeExpressOnramp,
  setNativeExpressOnrampSdk,
} from '../lib/express-onramp'
import {
  peekExpressOnrampStatus,
  subscribeExpressOnrampStatus,
} from '../lib/expressOnrampStatusCache'

export function ExpressOnrampNativeBridge({ children }: { children: React.ReactNode }) {
  let useOnramp: (() => Parameters<typeof adaptNativeOnramp>[0]) | null = null
  try {
    useOnramp = (
      require('@stripe/stripe-react-native') as {
        useOnramp: () => Parameters<typeof adaptNativeOnramp>[0]
      }
    ).useOnramp
  } catch {
    useOnramp = null
  }

  if (!useOnramp) return <>{children}</>
  return <ConfiguredOnrampBridge useOnramp={useOnramp}>{children}</ConfiguredOnrampBridge>
}

function ConfiguredOnrampBridge({
  children,
  useOnramp,
}: {
  children: React.ReactNode
  useOnramp: () => Parameters<typeof adaptNativeOnramp>[0]
}) {
  const onramp = useOnramp()
  const onrampRef = useRef(onramp)
  onrampRef.current = onramp
  const configuredFor = useRef<string | null>(null)
  const [, setStatusTick] = useState(0)

  useEffect(() => subscribeExpressOnrampStatus(() => setStatusTick((n) => n + 1)), [])

  const status = peekExpressOnrampStatus()
  const customerId = status?.cryptoCustomerId || undefined
  const country = (status?.payerCountry || 'US').slice(0, 2).toUpperCase()
  const configKey = `${customerId || ''}:${country}`

  useEffect(() => {
    const api = onrampRef.current
    if (configuredFor.current === configKey) {
      setNativeExpressOnrampSdk(adaptNativeOnramp(api))
      return
    }

    let cancelled = false
    void api
      .configure({
        merchantDisplayName: 'Easner',
        appearance: {
          style: 'ALWAYS_LIGHT',
          lightColors: {
            primary: colors.primary.main,
            contentOnPrimary: colors.neutral.white,
            borderSelected: colors.primary.main,
          },
        },
        ...(customerId ? { cryptoCustomerId: customerId } : {}),
        googlePay: {
          merchantCountryCode: country,
          merchantName: 'Easner',
        },
      })
      .then((result) => {
        if (cancelled) return
        if (result.error) {
          failNativeExpressOnramp(
            new Error(result.error.message || 'Express deposits is not ready. Try again in a moment.'),
          )
          return
        }
        configuredFor.current = configKey
        setNativeExpressOnrampSdk(adaptNativeOnramp(onrampRef.current))
      })
      .catch((error) => {
        if (cancelled) return
        failNativeExpressOnramp(
          error instanceof Error
            ? error
            : new Error('Express deposits is not ready. Try again in a moment.'),
        )
      })

    return () => {
      cancelled = true
    }
  }, [configKey, customerId, country])

  useEffect(() => {
    return () => setNativeExpressOnrampSdk(null)
  }, [])

  return <>{children}</>
}
