import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  expressDepositsStatusIsReady,
  parseExpressSavedPaymentMethods,
  type ExpressSavedPaymentMethods,
} from '@easner/shared'
import {
  fetchExpressOnrampStatus,
  hydrateExpressOnrampStatus,
  peekExpressOnrampStatus,
  subscribeExpressOnrampStatus,
  type ExpressOnrampStatus,
} from '../lib/expressOnrampStatusCache'

type Options = {
  refreshOnFocus?: boolean
}

/** Cache-first Express status: peek/hydrate immediately, refresh in the background. */
export function useExpressOnrampStatus(opts?: Options) {
  const [status, setStatus] = useState<ExpressOnrampStatus | null>(() => peekExpressOnrampStatus())

  useEffect(() => {
    const sync = (next: ExpressOnrampStatus | null | undefined) => {
      if (next) setStatus(next)
    }
    const unsub = subscribeExpressOnrampStatus(() => sync(peekExpressOnrampStatus()))
    void hydrateExpressOnrampStatus().then(sync)
    void fetchExpressOnrampStatus(false).then(sync).catch(() => undefined)
    return unsub
  }, [])

  const refreshOnFocus = Boolean(opts?.refreshOnFocus)
  useFocusEffect(
    useCallback(() => {
      if (!refreshOnFocus) return
      void fetchExpressOnrampStatus(false)
        .then((next) => setStatus(next))
        .catch(() => undefined)
    }, [refreshOnFocus]),
  )

  const paymentMethods: ExpressSavedPaymentMethods = parseExpressSavedPaymentMethods(status?.paymentMethods)
  return {
    status,
    ready: expressDepositsStatusIsReady(status),
    paymentMethods,
    publishableKey: status?.publishableKey ?? null,
    cryptoCustomerId: status?.cryptoCustomerId ?? null,
    payerCountry: status?.payerCountry ?? null,
    sourceCurrency: status?.sourceCurrency ?? null,
    loaded: status != null,
  }
}
