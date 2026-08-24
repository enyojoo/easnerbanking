"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  EXPRESS_DEPOSITS_COPY,
  expressDepositMethodTitle,
  expressDepositsQuoteIsStale,
  formatMoneyDisplay,
  formatSendRateLabel,
  useExpressDepositsAmountLimits,
  validateExpressDepositsAmount,
  type ExpressDepositsPricingBreakdown,
} from "@easner/shared"
import { Button } from "@/components/ui/button"
import { MoveAmountStep } from "@/components/accounts/move-amount-step"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { CashPayInMethodKind } from "@easner/shared"
import { loadExpressOnramp } from "@/lib/stripe/load-crypto-onramp"
import { ExpressDepositsStripeSlot } from "@/components/compliance/express-deposits-stripe-slot"
import { mapStripeOnrampError } from "@/lib/stripe/onramp-sdk-map"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { ExpressDepositsReviewSection } from "@/components/accounts/express-deposits-review-section"

const SCOPE = { "X-Easner-Account-Scope": "business" } as const

type ExpressKind = Extract<
  CashPayInMethodKind,
  "express_card" | "express_apple_pay" | "express_google_pay" | "express_ach"
>

type Step = "amount" | "collect" | "review" | "complete"

type Props = {
  method: ExpressKind
  onBack: () => void
  onNeedSetup: () => void
}

function paymentMethodParam(kind: ExpressKind): string {
  if (kind === "express_ach") return "ach"
  if (kind === "express_apple_pay") return "apple_pay"
  if (kind === "express_google_pay") return "google_pay"
  return "card"
}

export function AccountsExpressDepositFlow({ method, onBack, onNeedSetup }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("amount")
  const [amountStr, setAmountStr] = useState("")
  const [pricing, setPricing] = useState<ExpressDepositsPricingBreakdown | null>(null)
  const [sourceCurrency, setSourceCurrency] = useState("USD")
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState<boolean | null>(null)
  const [publishableKey, setPublishableKey] = useState<string | null>(null)
  const [cryptoCustomerId, setCryptoCustomerId] = useState<string | null>(null)
  const [paymentTokenId, setPaymentTokenId] = useState<string | null>(null)
  const [last4, setLast4] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  const usdCredit = Number.parseFloat(amountStr.replace(/,/g, "")) || 0
  const youPay = pricing?.totalToPay ?? null
  const amountLimit = validateExpressDepositsAmount({
    usdCredit,
    youPay,
    sourceCurrency,
  })
  const amountLimitError = usdCredit > 0 && !amountLimit.ok ? amountLimit.message : null

  useExpressDepositsAmountLimits({
    enabled: step === "amount" && ready !== false,
    usdCredit,
    youPay,
    sourceCurrency,
    onApplyUsdCredit: (amount) => {
      const rounded = Math.round(amount * 100) / 100
      setAmountStr(rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    },
  })

  const fetchQuote = useCallback(async (): Promise<ExpressDepositsPricingBreakdown | null> => {
    const res = await fetchWithSession("/api/stripe/onramp/quote", {
      method: "POST",
      headers: { ...SCOPE, "Content-Type": "application/json" },
      body: JSON.stringify({
        usdCredit,
        paymentMethod: paymentMethodParam(method),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      pricing?: ExpressDepositsPricingBreakdown
      sourceCurrency?: string
      error?: string
    }
    if (!res.ok) {
      setQuoteError(data.error || "Quote unavailable")
      setPricing(null)
      return null
    }
    setQuoteError(null)
    if (data.sourceCurrency) setSourceCurrency(data.sourceCurrency.toUpperCase())
    if (data.pricing) {
      setPricing(data.pricing)
      return data.pricing
    }
    setPricing(null)
    return null
  }, [method, usdCredit])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetchWithSession("/api/stripe/onramp/status", { headers: SCOPE })
      const data = (await res.json().catch(() => ({}))) as {
        ready?: boolean
        paymentTokenId?: string | null
        publishableKey?: string
        sourceCurrency?: string
        cryptoCustomerId?: string | null
      }
      if (cancelled) return
      if (!res.ok) {
        setReady(false)
        return
      }
      setReady(Boolean(data.ready))
      setPaymentTokenId(data.paymentTokenId ?? null)
      setPublishableKey(data.publishableKey ?? null)
      setCryptoCustomerId(data.cryptoCustomerId ?? null)
      if (data.sourceCurrency) setSourceCurrency(data.sourceCurrency.toUpperCase())
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!(usdCredit > 0) || ready === false || !amountLimit.ok) {
      setPricing(null)
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        await fetchQuote()
        if (cancelled) return
      })()
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [amountLimit.ok, fetchQuote, ready, usdCredit])

  const collectMethod = useCallback(async () => {
    if (!publishableKey) {
      onNeedSetup()
      return
    }
    setLoading(true)
    setConfirmError(null)
    try {
      const sdk = await loadExpressOnramp(publishableKey, cryptoCustomerId)
      const types = method === "express_ach" ? ["us_bank_account"] : ["card"]
      const el = await sdk.collectPaymentMethod(
        {
          payment_method_types: types,
          wallets: {
            applePay: method === "express_apple_pay" ? "auto" : "never",
            googlePay: method === "express_google_pay" ? "auto" : "never",
          },
        },
        async (result) => {
          const token = result.cryptoPaymentToken
          if (!token) return
          await fetchWithSession("/api/stripe/onramp/payment-tokens", {
            method: "POST",
            headers: { ...SCOPE, "Content-Type": "application/json" },
            body: JSON.stringify({ paymentTokenId: token }),
          })
          setPaymentTokenId(token)
          const card = result.paymentMethodDetails?.card as { last4?: string } | undefined
          const bank = result.paymentMethodDetails?.us_bank_account as { last4?: string } | undefined
          setLast4(card?.last4 || bank?.last4 || null)
          setSlot(null)
          setStep("review")
        },
      )
      setSlot(el)
      setStep("collect")
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : EXPRESS_DEPOSITS_COPY.somethingWentWrong)
    } finally {
      setLoading(false)
    }
  }, [cryptoCustomerId, method, onNeedSetup, publishableKey])

  const handleContinue = useCallback(async () => {
    if (!(usdCredit > 0)) return
    if (ready === false) {
      onNeedSetup()
      return
    }
    if (!amountLimit.ok) {
      setConfirmError(amountLimit.message)
      return
    }
    if (!pricing) {
      setConfirmError(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      return
    }
    if (!paymentTokenId && method !== "express_apple_pay" && method !== "express_google_pay") {
      await collectMethod()
      return
    }
    if ((method === "express_apple_pay" || method === "express_google_pay") && !paymentTokenId) {
      await collectMethod()
      return
    }
    setStep("review")
  }, [amountLimit, collectMethod, method, onNeedSetup, paymentTokenId, pricing, ready, usdCredit])

  const ensureFreshPricing = useCallback(async (): Promise<ExpressDepositsPricingBreakdown> => {
    if (pricing && !expressDepositsQuoteIsStale(pricing.rateFetchedAt)) return pricing
    const next = await fetchQuote()
    if (!next) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
    const limit = validateExpressDepositsAmount({
      usdCredit,
      youPay: next.totalToPay,
      sourceCurrency: next.sourceCurrency,
    })
    if (!limit.ok) throw new Error(limit.message)
    return next
  }, [fetchQuote, pricing, usdCredit])

  const handlePay = useCallback(async () => {
    setConfirmError(null)
    setLoading(true)
    try {
      await ensureFreshPricing()
      if (!publishableKey) throw new Error(EXPRESS_DEPOSITS_COPY.setupRequiredHint)
      const created = await fetchWithSession("/api/stripe/onramp/sessions", {
        method: "POST",
        headers: { ...SCOPE, "Content-Type": "application/json" },
        body: JSON.stringify({
          usdCredit,
          paymentMethod: paymentMethodParam(method),
          paymentTokenId,
        }),
      })
      const createdJson = (await created.json().catch(() => ({}))) as {
        session?: { id?: string }
        easnerTransactionId?: string | null
        error?: string
        code?: string
      }
      if (!created.ok || !createdJson.session?.id) {
        if (String(createdJson.code || "").includes("missing_document")) {
          onNeedSetup()
          return
        }
        setConfirmError(mapStripeOnrampError(createdJson.code, createdJson.error))
        return
      }
      const sessionId = createdJson.session.id
      const sdk = await loadExpressOnramp(publishableKey, cryptoCustomerId)
      const result = await sdk.performCheckout(sessionId, async (id) => {
        const paid = await fetchWithSession(`/api/stripe/onramp/sessions/${id}`, {
          method: "POST",
          headers: { ...SCOPE, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "checkout",
            paymentTokenId,
            mandateData: method === "express_ach" ? { customer_acceptance: { type: "online" } } : undefined,
          }),
        })
        const paidJson = (await paid.json().catch(() => ({}))) as {
          client_secret?: string
          error?: string
        }
        if (!paid.ok || !paidJson.client_secret) {
          throw new Error(paidJson.error || EXPRESS_DEPOSITS_COPY.paymentFailed)
        }
        return paidJson.client_secret
      })
      if (result && result.success === false) {
        await fetchWithSession(`/api/stripe/onramp/sessions/${sessionId}`, {
          method: "POST",
          headers: { ...SCOPE, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fail" }),
        })
        setConfirmError(EXPRESS_DEPOSITS_COPY.paymentFailed)
        return
      }
      const transactionId = String(createdJson.easnerTransactionId || "").trim()
      if (transactionId) {
        router.replace(transactionWebDetailPath(transactionId, { returnTo: "dashboard" }))
        return
      }
      setStep("complete")
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : EXPRESS_DEPOSITS_COPY.paymentFailed)
    } finally {
      setLoading(false)
    }
  }, [
    amountLimit,
    cryptoCustomerId,
    ensureFreshPricing,
    method,
    onNeedSetup,
    paymentTokenId,
    publishableKey,
    router,
    usdCredit,
  ])

  const inboundPreview = pricing
    ? [
        pricing.exchangeRate && pricing.exchangeRate.rate > 0
          ? formatSendRateLabel(
              pricing.exchangeRate.from,
              pricing.exchangeRate.to,
              pricing.exchangeRate.rate,
            )
          : null,
        `${EXPRESS_DEPOSITS_COPY.estimatedTotalToPay}: ${formatMoneyDisplay(pricing.totalToPay, pricing.sourceCurrency)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  if (step === "amount") {
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
          Back
        </Button>
        <MoveAmountStep
          variant="inbound"
          direction="usd_to_eur"
          onDirectionChange={() => {}}
          amountStr={amountStr}
          onAmountStrChange={setAmountStr}
          quote={null}
          indicativeRate={1}
          quoteRateLoading={false}
          quoteLoading={false}
          quoteError={quoteError}
          onContinue={() => void handleContinue()}
          continueDisabled={!(usdCredit > 0) || ready === false || Boolean(amountLimitError) || !pricing}
          inboundSourceCurrency="USD"
          inboundDestCurrency="USD"
          sourceTitle={expressDepositMethodTitle(method)}
          destTitle="USD Balance"
          inboundReceivePreview={inboundPreview}
        />
        {ready === false ? (
          <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.setupRequiredHint}</p>
        ) : null}
      </div>
    )
  }

  if (step === "collect") {
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => setStep("amount")}>
          Back
        </Button>
        <p className="text-sm font-medium">{EXPRESS_DEPOSITS_COPY.savePaymentTitle}</p>
        <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.savePaymentHint}</p>
        <ExpressDepositsStripeSlot element={slot} />
        {confirmError ? <p className="text-sm text-destructive">{confirmError}</p> : null}
      </div>
    )
  }

  if (step === "complete" && pricing) {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold">{EXPRESS_DEPOSITS_COPY.completeTitle}</h3>
        <ExpressDepositsReviewSection pricing={pricing} method={method} />
        {last4 ? <p className="text-sm text-muted-foreground">···· {last4}</p> : null}
        <Button className="w-full" onClick={onBack}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => setStep("amount")}>
        Back
      </Button>
      <h3 className="text-base font-semibold">{EXPRESS_DEPOSITS_COPY.reviewTitle}</h3>
      {pricing ? <ExpressDepositsReviewSection pricing={pricing} method={method} /> : null}
      {confirmError ? <p className="text-sm text-destructive">{confirmError}</p> : null}
      <Button className="w-full" size="lg" disabled={loading || !pricing} onClick={() => void handlePay()}>
        {loading ? "Processing…" : EXPRESS_DEPOSITS_COPY.payCta}
      </Button>
    </div>
  )
}
