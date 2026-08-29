import { useCallback, useEffect, useMemo, useState } from 'react'
import { isDraftRecipientId } from '@easner/shared'
import { apiFetch } from '../query/api-client'

export type YcPayInRail = 'bank_transfer' | 'mobile_money'

export type YcEligibilityResponse = {
  throughLocalCurrency: {
    provider?: 'yellowcard' | 'grid' | null
    payInCurrency: string | null
    available: boolean
    reason?: string
  }
  balancePayout: {
    provider: 'noah' | 'yellowcard' | 'grid' | null
    available: boolean
  }
}

export type YcCrossBorderQuoteResult = {
  ok: true
  provider?: 'yellowcard' | 'grid'
  quotePhase?: 'preview' | 'leg2_locked' | 'locked'
  quoteKey?: string
  leg2DraftId?: string
  transferId?: string
  transactionId?: string
  easnerTransactionId?: string
  localPayIn: number
  customerRate: number
  processingFee?: number
  ycLegFeesUsd?: number
  displayProcessingFee?: number
  displayProcessingFeeLocal?: number
  displayProcessingFeeCurrency?: string
  provisionalPayIn?: number
  receiveAmount?: number
  receiveCurrency?: string
  bankInfo?: Record<string, unknown> | null
  expiresAt: string
  payInNotice?: string
  payInRail?: YcPayInRail
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
}

type YcRateRow = {
  from_currency: string
  to_currency: string
  rate: number
}

export function residenceCountryFromPayInCurrency(currency: string): string | null {
  const cur = currency.trim().toUpperCase()
  const map: Record<string, string> = {
    NGN: 'NG',
    KES: 'KE',
    GHS: 'GH',
    ZAR: 'ZA',
    UGX: 'UG',
    TZS: 'TZ',
    RWF: 'RW',
    MXN: 'MX',
    BRL: 'BR',
    ARS: 'AR',
    COP: 'CO',
    CLP: 'CL',
  }
  return map[cur] ?? null
}

export function useYcCrossBorderFlow(input: {
  recipientId: string | null
  enabled: boolean
  receiveCurrency: string
  amountEntryMode: 'send' | 'receive'
  enteredAmount: number
  /** User-selected pay-in currency from the amount screen (skips waiting on eligibility). */
  payInCurrencyOverride?: string | null
  payInCountryOverride?: string | null
  /** Office routing for pay-in / cross-border quotes (skips waiting on eligibility). */
  crossBorderProviderOverride?: 'yellowcard' | 'grid' | null
}) {
  const [eligibility, setEligibility] = useState<YcEligibilityResponse | null>(null)
  const [eligibilityLoading, setEligibilityLoading] = useState(false)
  const [rates, setRates] = useState<YcRateRow[]>([])
  const [ratesLoading, setRatesLoading] = useState(false)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const payInCurrencyOverride = input.payInCurrencyOverride?.trim().toUpperCase() || null
  const payInCountryOverride = input.payInCountryOverride?.trim().toUpperCase() || null
  const payInCurrency =
    payInCurrencyOverride ?? eligibility?.throughLocalCurrency.payInCurrency?.trim().toUpperCase() ?? null
  const available = Boolean(
    payInCurrency &&
      (payInCurrencyOverride || eligibility?.throughLocalCurrency.available),
  )

  const crossBorderProvider: 'yellowcard' | 'grid' =
    input.crossBorderProviderOverride ??
    (eligibility?.throughLocalCurrency.provider === 'grid' ? 'grid' : 'yellowcard')

  useEffect(() => {
    if (!input.enabled || !input.recipientId || isDraftRecipientId(input.recipientId)) {
      setEligibility(null)
      setEligibilityLoading(false)
      return
    }
    let cancelled = false
    setEligibilityLoading(true)
    void (async () => {
      try {
        const data = await apiFetch<YcEligibilityResponse>(
          '/api/yellowcard/eligibility',
          { query: { recipientId: input.recipientId! } },
        )
        if (!cancelled) setEligibility(data)
      } catch {
        if (!cancelled) setEligibility(null)
      } finally {
        if (!cancelled) setEligibilityLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [input.enabled, input.recipientId])

  useEffect(() => {
    if (!payInCurrency) {
      setRates([])
      setRatesLoading(false)
      return
    }
    const dest = input.receiveCurrency.trim().toUpperCase()
    if (dest.length !== 3) return
    let cancelled = false
    setRatesLoading(true)
    void (async () => {
      try {
        const ratesPath =
          crossBorderProvider === 'grid'
            ? `/api/fx/grid-rates?destinations=${encodeURIComponent(dest)}`
            : `/api/fx/yc-rates?destinations=${encodeURIComponent(dest)}`
        const data = await apiFetch<{ rates?: YcRateRow[] }>(ratesPath)
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
  }, [payInCurrency, input.receiveCurrency, crossBorderProvider])

  const crossRate = useMemo(() => {
    if (!payInCurrency) return null
    const from = payInCurrency.toUpperCase()
    const to = input.receiveCurrency.trim().toUpperCase()
    return rates.find((r) => r.from_currency === from && r.to_currency === to) ?? null
  }, [rates, payInCurrency, input.receiveCurrency])

  const customerRate = crossRate?.rate && crossRate.rate > 0 ? crossRate.rate : null

  const preview = useMemo(() => {
    if (!customerRate || input.enteredAmount <= 0) {
      return { sendAmount: 0, receiveAmount: 0, forwardRate: customerRate ?? 1 }
    }
    if (input.amountEntryMode === 'receive') {
      const receiveAmount = input.enteredAmount
      const sendAmount = Math.round((receiveAmount / customerRate) * 100) / 100
      return { sendAmount, receiveAmount, forwardRate: customerRate }
    }
    const sendAmount = input.enteredAmount
    const receiveAmount = Math.round(sendAmount * customerRate * 100) / 100
    return { sendAmount, receiveAmount, forwardRate: customerRate }
  }, [customerRate, input.amountEntryMode, input.enteredAmount])

  const createQuote = useCallback(
    async (opts: {
      receiveAmount: number
      payInRail: YcPayInRail
      payInCountry?: string
      sourcePhone?: string
      networkId?: string
      sourceNetworkName?: string
    }): Promise<YcCrossBorderQuoteResult> => {
      if (!input.recipientId || !payInCurrency) {
        throw new Error('Through Local Currency is not available')
      }
      const payInCountry =
        opts.payInCountry?.trim().toUpperCase() ||
        payInCountryOverride ||
        residenceCountryFromPayInCurrency(payInCurrency)
      if (!payInCountry) {
        throw new Error('Pay-in country could not be resolved')
      }
      if (opts.payInRail === 'mobile_money' && (!opts.sourcePhone?.trim() || !opts.networkId?.trim())) {
        throw new Error('Mobile number and network are required')
      }
      setQuoteLoading(true)
      setQuoteError(null)
      try {
        const quotePath =
          crossBorderProvider === 'grid'
            ? '/api/grid/cross-border/quote'
            : '/api/yellowcard/cross-border/quote'
        const data = await apiFetch<YcCrossBorderQuoteResult, Record<string, unknown>>(
          quotePath,
          {
            method: 'POST',
            body: {
              recipientId: input.recipientId,
              receiveAmount: opts.receiveAmount,
              payInCurrency,
              payInCountry,
              payInRail: opts.payInRail,
              sourcePhone: opts.sourcePhone,
              networkId: opts.networkId,
              sourceNetworkName: opts.sourceNetworkName,
            },
          },
        )
        if (!data.ok) {
          const msg = 'Cross-border quote failed'
          setQuoteError(msg)
          throw new Error(msg)
        }
        return data
      } finally {
        setQuoteLoading(false)
      }
    },
    [input.recipientId, payInCurrency, payInCountryOverride, crossBorderProvider],
  )

  return {
    eligibility,
    eligibilityLoading,
    available,
    payInCurrency,
    crossBorderProvider,
    rates,
    ratesLoading,
    customerRate,
    preview,
    quoteLoading,
    quoteError,
    createQuote,
  }
}
