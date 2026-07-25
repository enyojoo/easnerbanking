import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import {
  ycFundBalanceQuoteErrorMessage,
  resolveYcPayInCustomerRate,
  resolveYcPayInYcSellRate,
  computeYcFundBalanceAmountPreview,
  resolvePayInProvider,
  resolvePrimaryPayoutProvider,
  type YcRateClientRow,
  type ProviderRoutingEntry,
} from '@easner/shared'
import { ApiError, apiFetch } from '../query/api-client'
import { fetchFundBalanceQuote, type YcFundBalanceQuote, type PayInProviderId } from '../lib/sendFlowFundBalanceQuote'
import {
  prefetchYcPayInRates,
  prefetchReceiveRails,
  hydrateReceiveRailsFromDisk,
  resolveReceiveRailsForDisplay,
  readCachedReceiveRails,
  readCachedReceiveRailsForProvider,
  readCachedYcPayInRates,
  type YcReceiveRailsResponse,
} from '../lib/warmYcLocalDepositCaches'
import type { YcPayInRail } from './useYcCrossBorderFlow'

function resolveFundBalancePayInProvider(input: {
  providerRouting?: ProviderRoutingEntry[] | null
  metadata?: Record<string, unknown> | null
  payInProvider?: PayInProviderId
}): PayInProviderId {
  if (input.payInProvider) return input.payInProvider
  const resolved = resolvePayInProvider({
    providerRouting: input.providerRouting,
    metadata: input.metadata,
  })
  if (resolved === 'grid' || resolved === 'yellowcard') return resolved
  if (resolvePrimaryPayoutProvider(input.providerRouting) === 'grid') return 'grid'
  return resolved
}

async function fetchGridPayInRates(currency: string): Promise<YcRateClientRow[]> {
  const dest = currency.trim().toUpperCase()
  const data = await apiFetch<{ rates?: YcRateClientRow[] }>('/api/fx/grid-rates', {
    query: dest.length === 3 ? { destinations: dest } : undefined,
  })
  return data.rates ?? []
}

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
  payInProvider?: PayInProviderId
}) {
  const country = input.country?.trim().toUpperCase() ?? ''
  const currency = input.currency?.trim().toUpperCase() ?? ''
  const corridorKey = country && currency ? `${country}:${currency}` : ''
  const payInProvider = input.payInProvider ?? 'yellowcard'

  const [rails, setRails] = useState<YcReceiveRailsResponse | null>(() =>
    input.enabled ? resolveReceiveRailsForDisplay(country, currency) : null,
  )
  // Never block UI on rails — display uses cache/optimistic; network refreshes quietly.
  const [loading, setLoading] = useState(false)

  const revalidate = useCallback(async () => {
    if (!input.enabled || !country || !currency) return
    await hydrateReceiveRailsFromDisk()
    const display = resolveReceiveRailsForDisplay(country, currency)
    if (display) setRails(display)
    const data = await prefetchReceiveRails({ provider: payInProvider, country, currency })
    setRails(data ?? display)
    setLoading(false)
  }, [input.enabled, country, currency, payInProvider])

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
      await hydrateReceiveRailsFromDisk()
      if (cancelled) return
      const display = resolveReceiveRailsForDisplay(country, currency)
      setRails(display)
      setLoading(false)
      const data = await prefetchReceiveRails({ provider: payInProvider, country, currency })
      if (!cancelled) {
        setRails(
          data ??
            display ??
            readCachedReceiveRailsForProvider(payInProvider, country, currency),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [input.enabled, corridorKey, country, currency, payInProvider])

  useRevalidateOnAppActive(revalidate)

  return { rails, loading, blocking: false, revalidate }
}

export function useYcFundBalanceFlow(input: {
  country: string | null
  currency: string | null
  rail: YcPayInRail
  enabled: boolean
  amountEntryMode: 'usd' | 'local'
  enteredAmount: number
  payInProvider?: PayInProviderId
  providerRouting?: ProviderRoutingEntry[] | null
  metadata?: Record<string, unknown> | null
}) {
  const currency = input.currency?.trim().toUpperCase() ?? ''
  const payInProvider = useMemo(
    () =>
      resolveFundBalancePayInProvider({
        payInProvider: input.payInProvider,
        providerRouting: input.providerRouting,
        metadata: input.metadata,
      }),
    [input.payInProvider, input.providerRouting, input.metadata],
  )
  const [rates, setRates] = useState<YcRateClientRow[]>(() => readCachedYcPayInRates() ?? [])
  const [ratesLoading, setRatesLoading] = useState(
    () => Boolean(input.enabled && currency && payInProvider !== 'grid' && !readCachedYcPayInRates()),
  )
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const revalidateRates = useCallback(async () => {
    if (!input.enabled || !currency) return
    if (payInProvider === 'grid') {
      setRatesLoading(true)
      const next = await fetchGridPayInRates(currency).catch(() => [] as YcRateClientRow[])
      setRates(next)
      setRatesLoading(false)
      return
    }
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
  }, [input.enabled, currency, payInProvider])

  useEffect(() => {
    if (!input.enabled || !currency) {
      setRatesLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      if (payInProvider === 'grid') {
        setRatesLoading(true)
        const next = await fetchGridPayInRates(currency).catch(() => [] as YcRateClientRow[])
        if (!cancelled) setRates(next)
        if (!cancelled) setRatesLoading(false)
        return
      }
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
  }, [input.enabled, currency, payInProvider])

  useRevalidateOnAppActive(revalidateRates)

  const customerRate = useMemo(() => {
    if (!input.currency) return null
    if (payInProvider === 'grid') {
      const cur = input.currency.trim().toUpperCase()
      const row = rates.find(
        (r) =>
          String(r.from_currency || '').toUpperCase() === cur &&
          String(r.to_currency || '').toUpperCase() === 'USD',
      )
      return row?.rate ?? null
    }
    return resolveYcPayInCustomerRate(rates, input.currency)
  }, [rates, input.currency, payInProvider])

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
          payInProvider,
          providerRouting: input.providerRouting,
          metadata: input.metadata,
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
    [input.country, input.currency, input.rail, input.amountEntryMode, input.providerRouting, input.metadata, payInProvider],
  )

  return {
    rates,
    ratesLoading: ratesLoading && rates.length === 0,
    customerRate,
    payInProvider,
    preview,
    quoteLoading,
    quoteError,
    createQuote,
  }
}
