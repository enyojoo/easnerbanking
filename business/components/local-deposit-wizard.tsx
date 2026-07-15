"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  Copy,
  Landmark,
  Loader2,
  Smartphone,
} from "lucide-react"
import {
  formatMoneyDisplay,
  formatSendRateLabel,
  mapResidenceToLocalPayInCurrency,
  YC_PAY_IN_RATES_DESTINATION,
  resolveYcPayInCustomerRate,
  ycFundBalanceQuoteErrorMessage,
  type NgLocalIdType,
  type YcRateClientRow,
} from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { NgLocalVerificationNotice } from "@/components/compliance/ng-local-verification-notice"
import { ycBankInfoFields } from "@/lib/yc-bank-info-fields"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"
import { useWalletBalances } from "@/hooks/queries/use-wallets"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { useBusinessProfile } from "@/lib/use-business-profile"

type LocalRail = "bank_transfer" | "mobile_money"
type WizardStep = "rail" | "amount" | "review" | "payin"
type AmountMode = "usd" | "local"

type ReceiveRailsResponse = {
  ok: boolean
  rails: {
    bank_transfer: { available: boolean }
    mobile_money: { available: boolean }
  }
  anyAvailable: boolean
}

type FundBalanceQuote = {
  ok: true
  localPayIn: number
  usdCredit: number
  customerRate: number
  processingFee?: number
  bankInfo: Record<string, unknown> | null
  expiresAt: string
  transactionId: string | null
  easnerTransactionId?: string | null
  transferId: string | null
  payInNotice?: string
}

type YcRateRow = YcRateClientRow

type Props = {
  residenceCountry: string
  ngMissingType: NgLocalIdType | null
  onNgSaved: () => void
  copiedField: string | null
  onCopy: (text: string, field: string) => void
}

export function LocalDepositWizard({
  residenceCountry,
  ngMissingType,
  onNgSaved,
  copiedField,
  onCopy,
}: Props) {
  const { businessId } = useBusinessProfile()
  const walletQuery = useWalletBalances()
  const localPayInCurrency = mapResidenceToLocalPayInCurrency(residenceCountry) ?? ""

  const [step, setStep] = useState<WizardStep>("rail")
  const [rails, setRails] = useState<ReceiveRailsResponse | null>(null)
  const [railsLoading, setRailsLoading] = useState(true)
  const [rail, setRail] = useState<LocalRail>("bank_transfer")
  const [amountMode, setAmountMode] = useState<AmountMode>("usd")
  const [amountStr, setAmountStr] = useState("")
  const [rates, setRates] = useState<YcRateRow[]>([])
  const [quote, setQuote] = useState<FundBalanceQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const usdBalance = parseFloat(String(walletQuery.data?.balances?.USD ?? "0").replace(/,/g, "")) || 0
  const enteredAmount = Number.parseFloat(amountStr.replace(/,/g, "")) || 0

  const customerRate = useMemo(
    () => resolveYcPayInCustomerRate(rates, localPayInCurrency),
    [rates, localPayInCurrency],
  )

  const preview = useMemo(() => {
    if (!customerRate || enteredAmount <= 0) {
      return { usdCredit: 0, localPayIn: 0 }
    }
    if (amountMode === "local") {
      return {
        localPayIn: enteredAmount,
        usdCredit: Math.round((enteredAmount / customerRate) * 100) / 100,
      }
    }
    return {
      usdCredit: enteredAmount,
      localPayIn: Math.round(enteredAmount * customerRate * 100) / 100,
    }
  }, [customerRate, amountMode, enteredAmount])

  const quoteCountdown = useQuoteCountdown(quote?.expiresAt)

  useEffect(() => {
    let cancelled = false
    setRailsLoading(true)
    void (async () => {
      try {
        const res = await fetchWithSession(
          `/api/yellowcard/receive-rails?country=${encodeURIComponent(residenceCountry)}&currency=${encodeURIComponent(localPayInCurrency)}`,
        )
        const data = (await res.json().catch(() => ({}))) as ReceiveRailsResponse
        if (!cancelled) setRails(res.ok ? data : null)
      } catch {
        if (!cancelled) setRails(null)
      } finally {
        if (!cancelled) setRailsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [residenceCountry, localPayInCurrency])

  useEffect(() => {
    if (!localPayInCurrency) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchWithSession(
          `/api/fx/yc-rates?destinations=${encodeURIComponent(YC_PAY_IN_RATES_DESTINATION)}`,
        )
        const data = (await res.json().catch(() => ({}))) as { rates?: YcRateRow[] }
        if (!cancelled) setRates(data.rates ?? [])
      } catch {
        if (!cancelled) setRates([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [localPayInCurrency])

  useEffect(() => {
    if (railsLoading || !rails) return
    const bank = rails.rails.bank_transfer.available
    const momo = rails.rails.mobile_money.available
    const count = (bank ? 1 : 0) + (momo ? 1 : 0)
    if (count === 1) {
      setRail(bank ? "bank_transfer" : "mobile_money")
      setStep("amount")
    }
  }, [railsLoading, rails])

  const createQuote = useCallback(async () => {
    setQuoteLoading(true)
    setQuoteError(null)
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (businessId) headers["X-Easner-Noah-Scope"] = "business"
      const body =
        amountMode === "usd"
          ? {
              currency: localPayInCurrency,
              country: residenceCountry,
              usdCredit: preview.usdCredit,
              rail,
            }
          : {
              currency: localPayInCurrency,
              country: residenceCountry,
              localPayIn: preview.localPayIn,
              rail,
            }
      const res = await fetchWithSession("/api/yellowcard/fund-balance/quote", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as FundBalanceQuote & {
        error?: string
        code?: string
      }
      if (!res.ok || !data.ok) {
        const msg = ycFundBalanceQuoteErrorMessage(data.code, data.error)
        setQuoteError(msg)
        return null
      }
      setQuote(data)
      return data
    } catch {
      setQuoteError("Could not get payment details")
      return null
    } finally {
      setQuoteLoading(false)
    }
  }, [
    amountMode,
    businessId,
    localPayInCurrency,
    preview.localPayIn,
    preview.usdCredit,
    rail,
    residenceCountry,
  ])

  useEffect(() => {
    if (step !== "review") return
    let cancelled = false
    void (async () => {
      const result = await createQuote()
      if (!cancelled && !result) setQuote(null)
    })()
    return () => {
      cancelled = true
    }
  }, [step, createQuote])

  if (ngMissingType) {
    return (
      <NgLocalVerificationNotice missingType={ngMissingType} onSaved={onNgSaved} />
    )
  }

  if (railsLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!rails?.anyAvailable) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Local pay-in is not available for your country right now.
      </p>
    )
  }

  const bankAvailable = rails.rails.bank_transfer.available
  const momoAvailable = rails.rails.mobile_money.available
  const railLabel = rail === "mobile_money" ? "Mobile money" : "Bank transfer"
  const payInFields = ycBankInfoFields(quote?.bankInfo)

  const goBack = () => {
    if (step === "amount") setStep(bankAvailable && momoAvailable ? "rail" : "rail")
    else if (step === "review") setStep("amount")
    else if (step === "payin") setStep("review")
    else setStep("rail")
  }

  if (step === "rail") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground text-center">
          Choose how you want to pay in {localPayInCurrency}
        </p>
        <div className="flex flex-col gap-3">
          {bankAvailable ? (
            <button
              type="button"
              className="flex w-full items-center gap-4 rounded-xl border border-border p-4 min-h-[76px] hover:bg-muted/50 transition-colors text-left"
              onClick={() => {
                setRail("bank_transfer")
                setStep("amount")
              }}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Landmark className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">Bank</p>
                <p className="text-sm text-muted-foreground mt-0.5">Deposit via Bank Transfer</p>
              </div>
            </button>
          ) : null}
          {momoAvailable ? (
            <button
              type="button"
              className="flex w-full items-center gap-4 rounded-xl border border-border p-4 min-h-[76px] hover:bg-muted/50 transition-colors text-left"
              onClick={() => {
                setRail("mobile_money")
                setStep("amount")
              }}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Smartphone className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">Mobile money</p>
                <p className="text-sm text-muted-foreground mt-0.5">Deposit via Mobile Money</p>
              </div>
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (step === "amount") {
    const canContinue = enteredAmount > 0 && Boolean(customerRate)
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="rounded-xl border border-border p-4 flex items-center gap-3">
          <CurrencyFlagCircle currency="USD" size={28} />
          <div>
            <p className="text-xs text-muted-foreground">To:</p>
            <p className="font-medium">
              USD Balance • ${usdBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="local-deposit-amount">
            {amountMode === "usd" ? "Amount (USD)" : `Amount (${localPayInCurrency})`}
          </Label>
          <Input
            id="local-deposit-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
          {enteredAmount > 0 && customerRate ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (amountMode === "usd" && preview.localPayIn > 0) {
                  setAmountMode("local")
                  setAmountStr(String(preview.localPayIn))
                } else if (amountMode === "local" && preview.usdCredit > 0) {
                  setAmountMode("usd")
                  setAmountStr(String(preview.usdCredit))
                } else {
                  setAmountMode(amountMode === "usd" ? "local" : "usd")
                }
              }}
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-primary" />
              {amountMode === "usd"
                ? `Pay ≈ ${formatMoneyDisplay(preview.localPayIn, localPayInCurrency)}`
                : `Receive ≈ ${formatMoneyDisplay(preview.usdCredit, "USD")}`}
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2 rounded-full border border-border px-4 py-2 w-fit">
          <CurrencyFlagCircle currency={localPayInCurrency} size={20} />
          <span className="text-sm">
            {localPayInCurrency} • {railLabel}
          </span>
          {bankAvailable && momoAvailable ? (
            <button
              type="button"
              className="text-xs text-primary ml-2"
              onClick={() => setStep("rail")}
            >
              Change
            </button>
          ) : null}
        </div>

        <Button
          className="w-full"
          disabled={!canContinue}
          onClick={() => {
            setQuote(null)
            setQuoteError(null)
            setStep("review")
          }}
        >
          Continue
        </Button>
      </div>
    )
  }

  if (step === "review") {
    const transferMethod = rail === "mobile_money" ? "Mobile Money" : "Bank Transfer"
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="rounded-xl border border-border p-4 space-y-3 text-sm">
          {quoteLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : quote ? (
            <>
              {(quote.easnerTransactionId ?? quote.transactionId) ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Transaction ID</span>
                  <span className="font-mono text-right">
                    {(quote.easnerTransactionId ?? quote.transactionId)!.toUpperCase()}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">You pay</span>
                <span>{formatMoneyDisplay(quote.localPayIn, localPayInCurrency)}</span>
              </div>
              {(quote.processingFee ?? 0) > 0 ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Processing fee</span>
                  <span>{formatMoneyDisplay(quote.processingFee ?? 0, localPayInCurrency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Exchange rate</span>
                <span>{formatSendRateLabel("USD", localPayInCurrency, quote.customerRate)}</span>
              </div>
              <div className="flex justify-between gap-4 font-medium">
                <span>You receive</span>
                <span>{formatMoneyDisplay(quote.usdCredit, "USD")}</span>
              </div>
              <div className="flex justify-between gap-4 items-center">
                <span className="text-muted-foreground">To:</span>
                <span className="flex items-center gap-2">
                  <CurrencyFlagCircle currency="USD" size={18} />
                  USD Balance
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Transfer method</span>
                <span>{transferMethod}</span>
              </div>
              {quote.expiresAt ? (
                <p className="text-xs text-muted-foreground pt-1">
                  {quoteCountdown.expired
                    ? "Quote expired — go back and continue again."
                    : `Quote valid for ${quoteCountdown.label}`}
                </p>
              ) : null}
            </>
          ) : null}
          {quoteError ? <p className="text-sm text-destructive">{quoteError}</p> : null}
        </div>

        <Button
          className="w-full"
          disabled={!quote?.transferId || quoteCountdown.expired || quoteLoading}
          onClick={() => setStep("payin")}
        >
          Continue
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <p className="text-sm text-muted-foreground">
        Pay{" "}
        <span className="font-medium text-foreground">
          {formatMoneyDisplay(quote?.localPayIn ?? preview.localPayIn, localPayInCurrency)}
        </span>{" "}
        to credit{" "}
        <span className="font-medium text-foreground">
          {formatMoneyDisplay(quote?.usdCredit ?? preview.usdCredit, "USD")}
        </span>{" "}
        to your USD balance.
      </p>

      {quote?.payInNotice ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          {quote.payInNotice}
        </div>
      ) : null}

      <div className="rounded-xl border border-border p-4 space-y-1">
        <div className="flex items-center gap-2 mb-3">
          <Landmark className="h-5 w-5 text-primary" />
          <p className="font-medium">Payment details</p>
        </div>
        {payInFields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Payment details unavailable. Contact support with reference {quote?.transactionId}.
          </p>
        ) : (
          payInFields.map((f) => (
            <div
              key={f.id}
              className="flex justify-between items-center gap-4 py-3 border-b last:border-0"
            >
              <span className="text-sm text-muted-foreground">{f.label}</span>
              <button
                type="button"
                onClick={() => void onCopy(f.value, `local-wizard-${f.id}`)}
                className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors text-right"
              >
                <span className="break-all">{f.value}</span>
                {copiedField === `local-wizard-${f.id}` ? (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>
            </div>
          ))
        )}
      </div>

      {quote?.transactionId ? (
        <Button className="w-full" asChild>
          <Link href={transactionWebDetailPath(quote.transactionId)}>
            I&apos;ve made the payment
          </Link>
        </Button>
      ) : (
        <Button className="w-full" disabled>
          I&apos;ve made the payment
        </Button>
      )}
    </div>
  )
}
