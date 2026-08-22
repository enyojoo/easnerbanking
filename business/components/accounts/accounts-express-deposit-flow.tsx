"use client"

import { useCallback, useEffect, useState } from "react"
import {
  EXPRESS_DEPOSITS_COPY,
  expressDepositMethodTitle,
  formatMoneyDisplay,
  useExpressDepositsAmountLimits,
  validateExpressDepositsAmount,
} from "@easner/shared"
import { Button } from "@/components/ui/button"
import { MoveAmountStep } from "@/components/accounts/move-amount-step"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { CashPayInMethodKind } from "@easner/shared"
import { loadExpressOnramp } from "@/lib/stripe/load-crypto-onramp"
import { ExpressDepositsStripeSlot } from "@/components/compliance/express-deposits-stripe-slot"
import { mapStripeOnrampError } from "@/lib/stripe/onramp-sdk-map"

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
  const [step, setStep] = useState<Step>("amount")
  const [amountStr, setAmountStr] = useState("")
  const [youPay, setYouPay] = useState<number | null>(null)
  const [sourceCurrency, setSourceCurrency] = useState("USD")
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState<boolean | null>(null)
  const [publishableKey, setPublishableKey] = useState<string | null>(null)
  const [paymentTokenId, setPaymentTokenId] = useState<string | null>(null)
  const [last4, setLast4] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  const usdCredit = Number.parseFloat(amountStr.replace(/,/g, "")) || 0
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

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetchWithSession("/api/stripe/onramp/status", { headers: SCOPE })
      const data = (await res.json().catch(() => ({}))) as {
        ready?: boolean
        paymentTokenId?: string | null
        publishableKey?: string
        sourceCurrency?: string
      }
      if (cancelled) return
      if (!res.ok) {
        setReady(false)
        return
      }
      setReady(Boolean(data.ready))
      setPaymentTokenId(data.paymentTokenId ?? null)
      setPublishableKey(data.publishableKey ?? null)
      if (data.sourceCurrency) setSourceCurrency(data.sourceCurrency.toUpperCase())
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!(usdCredit > 0) || ready === false || !amountLimit.ok) return
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        setQuoteError(null)
        const res = await fetchWithSession("/api/stripe/onramp/quote", {
          method: "POST",
          headers: { ...SCOPE, "Content-Type": "application/json" },
          body: JSON.stringify({
            usdCredit,
            paymentMethod: paymentMethodParam(method),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          source_amount?: string
          source_total_amount?: string
          sourceCurrency?: string
          quotes?: Array<{ source_amount?: string; source_total_amount?: string }>
          error?: string
        }
        if (cancelled) return
        if (!res.ok) {
          setQuoteError(data.error || "Quote unavailable")
          setYouPay(null)
          return
        }
        if (data.sourceCurrency) setSourceCurrency(data.sourceCurrency.toUpperCase())
        const pay = Number(
          data.source_total_amount ??
            data.source_amount ??
            data.quotes?.[0]?.source_total_amount ??
            data.quotes?.[0]?.source_amount ??
            usdCredit,
        )
        setYouPay(Number.isFinite(pay) && pay > 0 ? pay : usdCredit)
      })()
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [amountLimit.ok, usdCredit, method, ready])

  const collectMethod = useCallback(async () => {
    if (!publishableKey) {
      onNeedSetup()
      return
    }
    setLoading(true)
    setConfirmError(null)
    try {
      const sdk = await loadExpressOnramp(publishableKey)
      const types =
        method === "express_ach"
          ? ["us_bank_account"]
          : ["card"]
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
  }, [method, onNeedSetup, publishableKey])

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
    if (!paymentTokenId && method !== "express_apple_pay" && method !== "express_google_pay") {
      await collectMethod()
      return
    }
    if ((method === "express_apple_pay" || method === "express_google_pay") && !paymentTokenId) {
      await collectMethod()
      return
    }
    setStep("review")
  }, [amountLimit, collectMethod, method, onNeedSetup, paymentTokenId, ready, usdCredit])

  const handlePay = useCallback(async () => {
    setConfirmError(null)
    setLoading(true)
    try {
      if (!amountLimit.ok) throw new Error(amountLimit.message)
      if (!publishableKey) throw new Error(EXPRESS_DEPOSITS_COPY.setupRequiredHint)
      const created = await fetchWithSession("/api/stripe/onramp/sessions", {
        method: "POST",
        headers: { ...SCOPE, "Content-Type": "application/json" },
        body: JSON.stringify({
          usdCredit,
          sourceAmount: youPay,
          paymentMethod: paymentMethodParam(method),
          paymentTokenId,
        }),
      })
      const createdJson = (await created.json().catch(() => ({}))) as {
        session?: { id?: string }
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
      const sdk = await loadExpressOnramp(publishableKey)
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
      setStep("complete")
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : EXPRESS_DEPOSITS_COPY.paymentFailed)
    } finally {
      setLoading(false)
    }
  }, [amountLimit, method, onNeedSetup, paymentTokenId, publishableKey, usdCredit, youPay])

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
          continueDisabled={!(usdCredit > 0) || ready === false || Boolean(amountLimitError)}
          inboundSourceCurrency="USD"
          inboundDestCurrency="USD"
          sourceTitle={expressDepositMethodTitle(method)}
          destTitle="USD Balance"
          inboundReceivePreview={
            youPay && youPay > 0
              ? `${EXPRESS_DEPOSITS_COPY.youPay}: ${formatMoneyDisplay(youPay, sourceCurrency)}`
              : null
          }
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

  if (step === "complete") {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold">{EXPRESS_DEPOSITS_COPY.completeTitle}</h3>
        <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{EXPRESS_DEPOSITS_COPY.youGet}</span>
            <span>{formatMoneyDisplay(usdCredit, "USD")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{EXPRESS_DEPOSITS_COPY.youPay}</span>
            <span>{formatMoneyDisplay(youPay ?? usdCredit, sourceCurrency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Method</span>
            <span>
              {expressDepositMethodTitle(method)}
              {last4 ? ` ···· ${last4}` : ""}
            </span>
          </div>
        </div>
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
      <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{EXPRESS_DEPOSITS_COPY.youGet}</span>
          <span>{formatMoneyDisplay(usdCredit, "USD")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{EXPRESS_DEPOSITS_COPY.youPay}</span>
          <span>{formatMoneyDisplay(youPay ?? usdCredit, sourceCurrency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Method</span>
          <span>{expressDepositMethodTitle(method)}</span>
        </div>
      </div>
      {confirmError ? <p className="text-sm text-destructive">{confirmError}</p> : null}
      <Button className="w-full" size="lg" disabled={loading} onClick={() => void handlePay()}>
        {loading ? "Processing…" : EXPRESS_DEPOSITS_COPY.payCta}
      </Button>
    </div>
  )
}
