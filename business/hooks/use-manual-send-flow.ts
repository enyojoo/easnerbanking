"use client"

import { useEffect, useMemo, useState } from "react"
import {
  pickDefaultManualPayInOption,
  routeManualPayInScreen,
  type ManualPayInPaymentMethodOption,
} from "@easner/shared"
import {
  fetchManualQuote,
  fetchManualSendCatalog,
  type ManualQuoteResponse,
  type ManualSendCatalogResponse,
} from "@/lib/manual-send-api"

export function useManualSendFlow(input: {
  enabled: boolean
  otherCurrency: string | null
  receiveCurrency: string
  amountEntryMode: "send" | "receive"
  enteredAmount: number
}) {
  const [catalog, setCatalog] = useState<ManualSendCatalogResponse | null>(null)
  const [quote, setQuote] = useState<ManualQuoteResponse | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  useEffect(() => {
    if (!input.enabled) return
    let cancelled = false
    void fetchManualSendCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c)
      })
      .catch(() => {
        if (!cancelled) setCatalog(null)
      })
    return () => {
      cancelled = true
    }
  }, [input.enabled])

  const sendCurrencies = catalog?.sendCurrencies ?? []
  const sendCurrencyOptions = catalog?.sendCurrencyOptions ?? []
  const paymentMethodsByCurrency = catalog?.paymentMethodsByCurrency ?? {}

  const payInOptions: ManualPayInPaymentMethodOption[] = useMemo(() => {
    if (!input.otherCurrency) return []
    return paymentMethodsByCurrency[input.otherCurrency] ?? []
  }, [input.otherCurrency, paymentMethodsByCurrency])

  useEffect(() => {
    if (!input.enabled || !input.otherCurrency || !input.receiveCurrency) {
      setQuote(null)
      return
    }
    if (input.enteredAmount <= 0) {
      setQuote(null)
      return
    }
    let cancelled = false
    void fetchManualQuote({
      direction: input.amountEntryMode,
      amount: input.enteredAmount,
      fromCurrency: input.otherCurrency,
      toCurrency: input.receiveCurrency,
    })
      .then((q) => {
        if (!cancelled) {
          setQuote(q)
          setQuoteError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setQuote(null)
          setQuoteError(e instanceof Error ? e.message : String(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    input.enabled,
    input.otherCurrency,
    input.receiveCurrency,
    input.amountEntryMode,
    input.enteredAmount,
  ])

  function defaultPaymentMethodId(): string | null {
    return pickDefaultManualPayInOption(payInOptions)?.id ?? null
  }

  function authorizePathForPaymentMethodId(pmId: string): string {
    const opt = payInOptions.find((o) => o.id === pmId)
    const route = routeManualPayInScreen(opt?.type ?? "bank_account")
    switch (route) {
      case "mobile_money":
        return "/send/authorize/mobile-money"
      case "open_banking":
        return "/send/authorize/open-banking"
      case "stablecoin":
        return "/send/authorize/stablecoin"
      case "qr":
      case "bank":
      default:
        return "/send/authorize/bank-transfer"
    }
  }

  return {
    catalog,
    sendCurrencies,
    sendCurrencyOptions,
    paymentMethodsByCurrency,
    payInOptions,
    quote,
    quoteError,
    defaultPaymentMethodId,
    authorizePathForPaymentMethodId,
  }
}
