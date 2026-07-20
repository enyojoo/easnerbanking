import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import {
  ycFundBalanceQuoteErrorMessage,
  resolveYcPayInCustomerRate,
  resolveYcPayInYcSellRate,
  computeYcFundBalanceAmountPreview,
  type YcRateClientRow,
} from '@easner/shared'
import { ApiError } from '../query/api-client'
import { fetchFundBalanceQuote, type YcFundBalanceQuote } from '../lib/sendFlowFundBalanceQuote'
import {
  prefetchYcPayInRates,
  prefetchYcReceiveRails,
  readCachedReceiveRails,
  readCachedYcPayInRates,
  type YcReceiveRailsResponse,
} from '../lib/warmYcLocalDepositCaches'
import type { YcPayInRail } from './useYcCrossBorderFlow'

export type { YcReceiveRailsResponse }

export type YcFundBalanceQuoteResult = YcFundBalanceQuote

function useRevalidateOnAppActive(revalidate: () => void) {
  const revalidateRef = useRef(revalidate)
  revalidateRef.current = revalidate

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') revalidateRef.current()
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [])
}

export function useYcReceiveRails(input: {
  country: string | null
  currency: string | null
  enabled: boolean
}) {
  const country = input.country?.trim().toUpperCase() ?? ''
  const currency = input.currency?.trim().toUpperCase() ?? ''
  const corridorKey = country && currency ? `${country}:${currency}` : ''

  const [rails, setRails] = useState<YcReceiveRailsResponse | null>(() =>
    country && currency ? readCachedReceiveRails(country, currency) : null,
  )
  const [loading, setLoading] = useState(() =>
    Boolean(input.enabled && country && currency && !readCachedReceiveRails(country, currency)),
  )

  const revalidate = useCallback(async () => {
    if (!input.enabled || !country || !currency) return
    const cached = readCachedReceiveRails(country, currency)
    if (cached) {
      setRails(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    const data = await prefetchYcReceiveRails(country, currency)
    setRails(data ?? cached ?? null)
    setLoading(false)
  }, [input.enabled, country, currency])

  useEffect(() => {
    if (!corridorKey) {
      setRails(null)
      setLoading(false)
      return
    }
    if (!input.enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const cached = readCachedReceiveRails(country, currency)
      if (cached) {
        setRails(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      const data = await prefetchYcReceiveRails(country, currency)
      if (!cancelled) {
        setRails(data ?? cached ?? null)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [input.enabled, corridorKey, country, currency])

  useRevalidateOnAppActive(revalidate)

  return { rails, loading, blocking: loading && !rails, revalidate }
}

export function useYcFundBalanceFlow(input: {
  country: string | null
  currency: string | null
  rail: YcPayInRail
  enabled: boolean
  amountEntryMode: 'usd' | 'local'
  enteredAmount: number
}) {
  const currency = input.currency?.trim().toUpperCase() ?? ''
  const [rates, setRates] = useState<YcRateClientRow[]>(() => readCachedYcPayInRates() ?? [])
  const [ratesLoading, setRatesLoading] = useState(
    () => Boolean(input.enabled && currency && !readCachedYcPayInRates()),
  )
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const revalidateRates = useCallback(async () => {
    if (!input.enabled || !currency) return
    const cached = readCachedYcPayInRates()
    if (cached?.length) {
      setRates(cached)
      setRatesLoading(false)
    } else {
      setRatesLoading(true)
    }
    const next = await prefetchYcPayInRates()
    setRates(next ?? cached ?? [])
    setRatesLoading(false)
  }, [input.enabled, currency])

  useEffect(() => {
    if (!input.enabled || !currency) {
      setRatesLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const cached = readCachedYcPayInRates()
      if (cached?.length) {
        setRates(cached)
        setRatesLoading(false)
      } else {
        setRatesLoading(true)
      }
      const next = await prefetchYcPayInRates()
      if (!cancelled) setRates(next ?? cached ?? [])
      if (!cancelled) setRatesLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [input.enabled, currency])

  useRevalidateOnAppActive(revalidateRates)

  const customerRate = useMemo(
    () => (input.currency ? resolveYcPayInCustomerRate(rates, input.currency) : null),
    [rates, input.currency],
  )

  const ycSellRate = useMemo(
    () =>
      input.currency
        ? resolveYcPayInYcSellRate(rates, input.currency) ?? customerRate
        : null,
    [rates, input.currency, customerRate],
  )

  const preview = useMemo(() => {
    if (!customerRate || !ycSellRate || input.enteredAmount <= 0) {
      return {
        usdCredit: 0,
        localPayIn: 0,
        estimatedTotalLocalPayIn: 0,
        forwardRate: customerRate ?? 1,
      }
    }
    const padded = computeYcFundBalanceAmountPreview({
      amountEntryMode: input.amountEntryMode,
      enteredAmount: input.enteredAmount,
      customerSellRate: customerRate,
      ycSellRate,
      rail: input.rail,
    })
    if (!padded) {
      return {
        usdCredit: 0,
        localPayIn: 0,
        estimatedTotalLocalPayIn: 0,
        forwardRate: customerRate,
      }
    }
    return { ...padded, forwardRate: customerRate }
  }, [customerRate, ycSellRate, input.amountEntryMode, input.enteredAmount, input.rail])

  const createQuote = useCallback(
    async (opts: {
      usdCredit?: number
      localPayIn?: number
      amountEntryMode?: 'usd' | 'local'
    }): Promise<YcFundBalanceQuoteResult> => {
      if (!input.country || !input.currency) {
        throw new Error('Residence country required')
      }
      setQuoteLoading(true)
      setQuoteError(null)
      try {
        const mode = opts.amountEntryMode ?? input.amountEntryMode
        const usdCredit = opts.usdCredit ?? 0
        const localPayIn = opts.localPayIn ?? 0
        const enteredAmount = mode === 'usd' ? usdCredit : localPayIn
        const data = await fetchFundBalanceQuote({
          country: input.country,
          currency: input.currency,
          rail: input.rail,
          amountEntryMode: mode,
          enteredAmount,
        })
        return data
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? ycFundBalanceQuoteErrorMessage(e.code ?? undefined, e.message)
            : e instanceof Error
              ? e.message
              : 'Could not get payment details'
        setQuoteError(msg)
        throw new Error(msg)
      } finally {
        setQuoteLoading(false)
      }
    },
    [input.country, input.currency, input.rail, input.amountEntryMode],
  )

  return {
    rates,
    ratesLoading: ratesLoading && rates.length === 0,
    customerRate,
    preview,
    quoteLoading,
    quoteError,
    createQuote,
  }
}
