import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ycFundBalanceQuoteErrorMessage,
  YC_PAY_IN_RATES_DESTINATION,
  resolveYcPayInCustomerRate,
  type YcRateClientRow,
} from '@easner/shared'
import { ApiError, apiFetch } from '../query/api-client'
import type { YcPayInRail } from './useYcCrossBorderFlow'

export type YcReceiveRailsResponse = {
  ok: boolean
  country: string
  currency: string
  rails: {
    bank_transfer: { available: boolean }
    mobile_money: { available: boolean }
  }
  anyAvailable: boolean
}

export type YcFundBalanceQuoteResult = {
  ok: true
  sequenceId: string
  localPayIn: number
  usdCredit: number
  customerRate: number
  processingFee?: number
  bankInfo: Record<string, unknown> | null
  expiresAt: string
  transactionId: string | null
  transferId: string | null
  payInNotice?: string
}

const RECEIVE_RAILS_CACHE_TTL_MS = 5 * 60_000
const receiveRailsCache = new Map<string, { data: YcReceiveRailsResponse; at: number }>()

function receiveRailsCacheKey(country: string, currency: string): string {
  return `${country.trim().toUpperCase()}:${currency.trim().toUpperCase()}`
}

function readCachedReceiveRails(country: string, currency: string): YcReceiveRailsResponse | null {
  const key = receiveRailsCacheKey(country, currency)
  const hit = receiveRailsCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > RECEIVE_RAILS_CACHE_TTL_MS) {
    receiveRailsCache.delete(key)
    return null
  }
  return hit.data
}

export function useYcReceiveRails(input: {
  country: string | null
  currency: string | null
  enabled: boolean
}) {
  const country = input.country?.trim().toUpperCase() ?? ''
  const currency = input.currency?.trim().toUpperCase() ?? ''
  const cacheKey = country && currency ? receiveRailsCacheKey(country, currency) : ''

  const [rails, setRails] = useState<YcReceiveRailsResponse | null>(() =>
    country && currency ? readCachedReceiveRails(country, currency) : null,
  )
  const [loading, setLoading] = useState(() =>
    Boolean(input.enabled && country && currency && !readCachedReceiveRails(country, currency)),
  )

  useEffect(() => {
    if (!input.enabled || !country || !currency) {
      setRails(null)
      setLoading(false)
      return
    }
    let cancelled = false
    const cached = readCachedReceiveRails(country, currency)
    if (!cached) setLoading(true)
    void (async () => {
      try {
        const data = await apiFetch<YcReceiveRailsResponse>('/api/yellowcard/receive-rails', {
          query: { country, currency },
        })
        if (!cancelled) {
          setRails(data)
          receiveRailsCache.set(cacheKey, { data, at: Date.now() })
        }
      } catch {
        if (!cancelled && !cached) setRails(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [input.enabled, country, currency, cacheKey])

  return { rails, loading }
}

export function useYcFundBalanceFlow(input: {
  country: string | null
  currency: string | null
  rail: YcPayInRail
  enabled: boolean
  amountEntryMode: 'usd' | 'local'
  enteredAmount: number
}) {
  const [rates, setRates] = useState<YcRateClientRow[]>([])
  const [ratesLoading, setRatesLoading] = useState(false)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  useEffect(() => {
    if (!input.enabled || !input.currency) {
      setRates([])
      setRatesLoading(false)
      return
    }
    let cancelled = false
    setRatesLoading(true)
    void (async () => {
      try {
        const data = await apiFetch<{ rates?: YcRateClientRow[] }>('/api/fx/yc-rates', {
          query: { destinations: YC_PAY_IN_RATES_DESTINATION },
        })
        if (!cancelled) setRates(data.rates ?? [])
      } catch {
        if (!cancelled) setRates([])
      } finally {
        if (!cancelled) setRatesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [input.enabled, input.currency])

  const customerRate = useMemo(
    () => (input.currency ? resolveYcPayInCustomerRate(rates, input.currency) : null),
    [rates, input.currency],
  )

  const preview = useMemo(() => {
    if (!customerRate || input.enteredAmount <= 0) {
      return { usdCredit: 0, localPayIn: 0, forwardRate: customerRate ?? 1 }
    }
    if (input.amountEntryMode === 'local') {
      const localPayIn = input.enteredAmount
      const usdCredit = Math.round((localPayIn / customerRate) * 100) / 100
      return { usdCredit, localPayIn, forwardRate: customerRate }
    }
    const usdCredit = input.enteredAmount
    const localPayIn = Math.round(usdCredit * customerRate * 100) / 100
    return { usdCredit, localPayIn, forwardRate: customerRate }
  }, [customerRate, input.amountEntryMode, input.enteredAmount])

  const createQuote = useCallback(
    async (opts: {
      usdCredit?: number
      localPayIn?: number
    }): Promise<YcFundBalanceQuoteResult> => {
      if (!input.country || !input.currency) {
        throw new Error('Residence country required')
      }
      setQuoteLoading(true)
      setQuoteError(null)
      try {
        const body: Record<string, unknown> = {
          currency: input.currency,
          country: input.country,
          rail: input.rail,
        }
        if (opts.usdCredit != null && opts.usdCredit > 0) {
          body.usdCredit = opts.usdCredit
        } else if (opts.localPayIn != null && opts.localPayIn > 0) {
          body.localPayIn = opts.localPayIn
        } else {
          throw new Error('Enter a valid amount')
        }
        const data = await apiFetch<YcFundBalanceQuoteResult, Record<string, unknown>>(
          '/api/yellowcard/fund-balance/quote',
          { method: 'POST', body },
        )
        if (!data.ok) {
          const msg = 'Fund balance quote failed'
          setQuoteError(msg)
          throw new Error(msg)
        }
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
    [input.country, input.currency, input.rail],
  )

  return {
    rates,
    ratesLoading,
    customerRate,
    preview,
    quoteLoading,
    quoteError,
    createQuote,
  }
}
