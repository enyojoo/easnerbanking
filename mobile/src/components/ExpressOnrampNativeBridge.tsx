import React, { Component, useEffect, useRef, useState } from 'react'
import {
  EXPRESS_ONRAMP_MERCHANT_NAME,
  expressOnrampLinkConfigure,
} from '@easner/shared'
import {
  adaptNativeOnramp,
  failNativeExpressOnramp,
  setNativeExpressOnrampSdk,
} from '../lib/express-onramp'
import {
  peekExpressOnrampStatus,
  subscribeExpressOnrampStatus,
} from '../lib/expressOnrampStatusCache'

function onrampErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Express deposits is not ready. Try again in a moment.'
  const row = error as { message?: string; localizedMessage?: string }
  return row.message || row.localizedMessage || 'Express deposits is not ready. Try again in a moment.'
}

function isMissingNativeModule(error: unknown): boolean {
  return /not available|includeOnramp/i.test(error instanceof Error ? error.message : onrampErrorMessage(error))
}

async function configureWhenReady(
  configure: (config: Record<string, unknown>) => Promise<{ error?: { message?: string } }>,
  config: Record<string, unknown>,
) {
  let last: unknown
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const result = await configure(config)
      if (!result?.error) return
      last = result.error
      if (isMissingNativeModule(result.error)) throw new Error(onrampErrorMessage(result.error))
    } catch (error) {
      last = error
      if (isMissingNativeModule(error)) throw error instanceof Error ? error : new Error(onrampErrorMessage(error))
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
  }
  throw last instanceof Error ? last : new Error(onrampErrorMessage(last))
}

class BridgeGuard extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    failNativeExpressOnramp(new Error('Express deposits is not ready. Try again in a moment.'))
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

export function ExpressOnrampNativeBridge() {
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

  if (!useOnramp) return null
  return (
    <BridgeGuard>
      <ConfiguredOnrampBridge useOnramp={useOnramp} />
    </BridgeGuard>
  )
}

function ConfiguredOnrampBridge({
  useOnramp,
}: {
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
  const publishableKey = status?.publishableKey || ''
  const configKey = `${customerId || ''}:${country}:${publishableKey}`

  useEffect(() => {
    const api = onrampRef.current
    if (typeof api.configure !== 'function') {
      failNativeExpressOnramp(new Error('Express deposits is not ready. Try again in a moment.'))
      return
    }
    if (configuredFor.current === configKey) {
      setNativeExpressOnrampSdk(adaptNativeOnramp(api))
      return
    }

    let cancelled = false
    void configureWhenReady(api.configure as (config: Record<string, unknown>) => Promise<{ error?: { message?: string } }>, {
      ...expressOnrampLinkConfigure(),
      ...(customerId ? { cryptoCustomerId: customerId } : {}),
      googlePay: {
        merchantCountryCode: country,
        merchantName: EXPRESS_ONRAMP_MERCHANT_NAME,
        testEnv: publishableKey.startsWith('pk_test'),
      },
    })
      .then(() => {
        if (cancelled) return
        configuredFor.current = configKey
        setNativeExpressOnrampSdk(adaptNativeOnramp(onrampRef.current))
      })
      .catch((error) => {
        if (cancelled) return
        if (configuredFor.current) {
          setNativeExpressOnrampSdk(adaptNativeOnramp(onrampRef.current))
          return
        }
        failNativeExpressOnramp(error instanceof Error ? error : new Error(onrampErrorMessage(error)))
      })

    return () => {
      cancelled = true
    }
  }, [configKey, customerId, country, publishableKey])

  return null
}
