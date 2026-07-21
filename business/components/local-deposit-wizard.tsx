"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
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
  mapResidenceToLocalPayInCurrency,
  resolveYcPayInCustomerRate,
  resolveYcPayInYcSellRate,
  computeYcFundBalanceAmountPreview,
  ycFundBalanceQuoteErrorMessage,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE,
  validateYcFundBalancePayInAmount,
  REVIEW_ROW_LABELS,
  normalizeYcMomoPhone,
  type NgLocalIdType,
  type YcRateClientRow,
  useDebouncedValue,
  QUOTE_PREFETCH_DEBOUNCE_MS,
} from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { NgLocalVerificationNotice } from "@/components/compliance/ng-local-verification-notice"
import { YcPayInReviewSection } from "@/components/yc/yc-pay-in-review-section"
import { YcMomoPhoneInput } from "@/components/yc-momo-phone-input"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { useWalletBalances } from "@/hooks/queries/use-wallets"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useYcPayInMinEnforcement } from "@/hooks/use-yc-pay-in-min-enforcement"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"

type LocalRail = "bank_transfer" | "mobile_money"
type WizardStep = "rail" | "amount" | "momo_setup" | "review"
type AmountMode = "usd" | "local"

import {
  prefetchYcReceiveRails,
  prefetchYcPayInNetworks,
  prefetchYcPayInRates,
  readCachedReceiveRails,
  readCachedYcPayInNetworks,
  readCachedYcPayInRates,
  type ReceiveRailsResponse,
} from "@/lib/yc-local-deposit-cache"

type FundBalanceQuote = {
  ok: true
  localPayIn: number
  usdCredit: number
  customerRate: number
  processingFee?: number
  ycChannelFeeUsd?: number
  displayProcessingFee?: number
  displayProcessingFeeLocal?: number
  provisionalPayIn?: number
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
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
  initialRail?: LocalRail
  initialStep?: "amount"
  onExitToCashList?: () => void
}

export function LocalDepositWizard({
  residenceCountry,
  ngMissingType,
  onNgSaved,
  copiedField,
  onCopy,
  initialRail,
  initialStep,
  onExitToCashList,
}: Props) {
  const router = useRouter()
  const { businessId } = useBusinessProfile()
  const walletQuery = useWalletBalances()
  const localPayInCurrency = mapResidenceToLocalPayInCurrency(residenceCountry) ?? ""

  const [step, setStep] = useState<WizardStep>(
    initialStep === "amount" && initialRail ? "amount" : "rail",
  )
  const [rails, setRails] = useState<ReceiveRailsResponse | null>(() =>
    readCachedReceiveRails(residenceCountry, localPayInCurrency),
  )
  const [railsLoading, setRailsLoading] = useState(
    () => !readCachedReceiveRails(residenceCountry, localPayInCurrency),
  )
  const [rail, setRail] = useState<LocalRail>(initialRail ?? "bank_transfer")
  const [amountMode, setAmountMode] = useState<AmountMode>("usd")
  const [amountStr, setAmountStr] = useState("")
  const [rates, setRates] = useState<YcRateRow[]>(() => readCachedYcPayInRates() ?? [])
  const [quote, setQuote] = useState<FundBalanceQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [defaultPhone, setDefaultPhone] = useState("")
  const [momoPhone, setMomoPhone] = useState("")
  const [momoNetworkId, setMomoNetworkId] = useState("")
  const [momoNetworks, setMomoNetworks] = useState<{ id: string; name: string }[]>(() => {
    const cached = readCachedYcPayInNetworks(residenceCountry, localPayInCurrency)
    return cached ?? []
  })
  const [momoNetworksLoading, setMomoNetworksLoading] = useState(() => {
    const cached = readCachedYcPayInNetworks(residenceCountry, localPayInCurrency)
    return rail === "mobile_money" && !cached?.length
  })
  const [isContinueLoading, setIsContinueLoading] = useState(false)

  const isMomo = rail === "mobile_money"

  const usdBalance = parseFloat(String(walletQuery.data?.balances?.USD ?? "0").replace(/,/g, "")) || 0
  const enteredAmount = Number.parseFloat(amountStr.replace(/,/g, "")) || 0

  const customerRate = useMemo(
    () => resolveYcPayInCustomerRate(rates, localPayInCurrency),
    [rates, localPayInCurrency],
  )

  const ycSellRate = useMemo(
    () => resolveYcPayInYcSellRate(rates, localPayInCurrency) ?? customerRate,
    [rates, localPayInCurrency, customerRate],
  )

  const preview = useMemo(() => {
    if (!customerRate || !ycSellRate || enteredAmount <= 0) {
      return { usdCredit: 0, localPayIn: 0 }
    }
    return (
      computeYcFundBalanceAmountPreview({
        amountEntryMode: amountMode,
        enteredAmount,
        customerSellRate: customerRate,
        ycSellRate,
        rail,
      }) ?? { usdCredit: 0, localPayIn: 0, estimatedTotalLocalPayIn: 0, feeInclusive: false as const }
    )
  }, [customerRate, ycSellRate, amountMode, enteredAmount, rail])

  const quoteMatchesAmount = useMemo(() => {
    if (!quote?.ok || !(quote.localPayIn > 0)) return false
    const credit = quote.usdCredit ?? quote.creditOrReceiveAmount ?? 0
    if (amountMode === "usd") {
      return Math.abs(credit - enteredAmount) < 0.01
    }
    return Math.abs(credit - preview.usdCredit) < 0.01
  }, [quote, amountMode, enteredAmount, preview.usdCredit])

  const displayPreview = useMemo(() => {
    if (quoteMatchesAmount && quote) {
      return {
        usdCredit: quote.usdCredit ?? quote.creditOrReceiveAmount ?? preview.usdCredit,
        localPayIn: quote.localPayIn,
        estimatedTotalLocalPayIn: quote.localPayIn,
        feeInclusive: true as const,
      }
    }
    return preview
  }, [quote, quoteMatchesAmount, preview])

  const payInLimits = useMemo(
    () => ({
      minLocalPayIn: rails?.rails[rail]?.minLocalPayIn ?? null,
      maxLocalPayIn: rails?.rails[rail]?.maxLocalPayIn ?? null,
    }),
    [rails, rail],
  )

  const minEnforcementSeedKey =
    customerRate && localPayInCurrency
      ? `${residenceCountry}:${localPayInCurrency}:${rail}:${amountMode}`
      : null

  useYcPayInMinEnforcement({
    enabled: step === "amount" && Boolean(customerRate && payInLimits.minLocalPayIn),
    seedKey: minEnforcementSeedKey,
    minLocalPayIn: payInLimits.minLocalPayIn,
    amountEntryMode: amountMode,
    enteredAmount,
    customerSellRate: customerRate,
    onApplyEnteredAmount: (amount) => {
      const rounded = Math.round(amount * 100) / 100
      setAmountStr(Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2))
    },
  })

  useEffect(() => {
    let cancelled = false
    const cached = readCachedReceiveRails(residenceCountry, localPayInCurrency)
    if (cached) {
      setRails(cached)
      setRailsLoading(false)
    } else {
      setRailsLoading(true)
    }
    void (async () => {
      const data = await prefetchYcReceiveRails(residenceCountry, localPayInCurrency)
      if (!cancelled) {
        setRails(data ?? cached)
        setRailsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [residenceCountry, localPayInCurrency])

  useEffect(() => {
    if (!localPayInCurrency) return
    let cancelled = false
    const cached = readCachedYcPayInRates()
    if (cached) setRates(cached)
    void (async () => {
      const next = await prefetchYcPayInRates()
      if (!cancelled) setRates(next ?? cached ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [localPayInCurrency])

  useEffect(() => {
    if (!isMomo || !residenceCountry || !localPayInCurrency) return
    if (step !== "amount" && step !== "momo_setup") return
    let cancelled = false
    const cached = readCachedYcPayInNetworks(residenceCountry, localPayInCurrency)
    if (cached?.length) {
      setMomoNetworks(cached)
      if (cached.length === 1 && !momoNetworkId) setMomoNetworkId(cached[0].id)
      setMomoNetworksLoading(false)
    } else {
      setMomoNetworksLoading(true)
    }
    void (async () => {
      try {
        const res = await prefetchYcPayInNetworks(residenceCountry, localPayInCurrency)
        if (!cancelled) {
          setMomoNetworks(res)
          if (res.length === 1 && !momoNetworkId) setMomoNetworkId(res[0].id)
        }
      } finally {
        if (!cancelled) setMomoNetworksLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isMomo, residenceCountry, localPayInCurrency, step, momoNetworkId])

  useEffect(() => {
    if (initialStep === "amount" && initialRail) return
    if (railsLoading || !rails) return
    const bank = rails.rails.bank_transfer.available
    const momo = rails.rails.mobile_money.available
    const count = (bank ? 1 : 0) + (momo ? 1 : 0)
    if (count === 1) {
      setRail(bank ? "bank_transfer" : "mobile_money")
      setStep("amount")
    }
  }, [railsLoading, rails, initialStep, initialRail])

  const confirmOrder = useCallback(async (opts?: { silent?: boolean }) => {
    setQuoteError(null)
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (businessId) headers["X-Easner-Noah-Scope"] = "business"
      const body: Record<string, unknown> =
        amountMode === "usd"
          ? {
              currency: localPayInCurrency,
              country: residenceCountry,
              usdCredit: enteredAmount,
              rail,
            }
          : {
              currency: localPayInCurrency,
              country: residenceCountry,
              localPayIn: enteredAmount,
              rail,
            }
      if (isMomo) {
        body.sourcePhone = momoPhone.trim() || defaultPhone.trim()
        body.networkId = momoNetworkId
        const net = momoNetworks.find((n) => n.id === momoNetworkId)
        if (net?.name) body.sourceNetworkName = net.name
      }
      const res = await fetchWithSession("/api/yellowcard/fund-balance/confirm", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as FundBalanceQuote & {
        error?: string
        code?: string
      }
      if (!res.ok || !data.ok || !data.transferId) {
        const msg = ycFundBalanceQuoteErrorMessage(data.code, data.error)
        if (!opts?.silent) setQuoteError(msg)
        return null
      }
      setQuote(data)
      return data
    } catch {
      if (!opts?.silent) setQuoteError("Could not lock payment details")
      return null
    }
  }, [
    amountMode,
    businessId,
    enteredAmount,
    localPayInCurrency,
    rail,
    residenceCountry,
    isMomo,
    momoPhone,
    momoNetworkId,
    momoNetworks,
    defaultPhone,
  ])

  const momoReady = useMemo(
    () => Boolean((momoPhone.trim() || defaultPhone.trim()) && momoNetworkId),
    [momoPhone, defaultPhone, momoNetworkId],
  )

  const quotePrefetchKey =
    step === "amount" && enteredAmount > 0 && customerRate
      ? [residenceCountry, localPayInCurrency, amountMode, enteredAmount, rail].join("|")
      : ""

  const [debouncedQuotePrefetchKey] = useDebouncedValue(
    quotePrefetchKey,
    QUOTE_PREFETCH_DEBOUNCE_MS,
  )

  useEffect(() => {
    if (!debouncedQuotePrefetchKey || enteredAmount <= 0) return
    let cancelled = false
    void (async () => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (businessId) headers["X-Easner-Noah-Scope"] = "business"
        const body: Record<string, unknown> =
          amountMode === "usd"
            ? {
                currency: localPayInCurrency,
                country: residenceCountry,
                usdCredit: enteredAmount,
                rail,
              }
            : {
                currency: localPayInCurrency,
                country: residenceCountry,
                localPayIn: enteredAmount,
                rail,
              }
        const res = await fetchWithSession("/api/yellowcard/fund-balance/quote", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })
        const data = (await res.json().catch(() => null)) as FundBalanceQuote | null
        if (!cancelled && res.ok && data?.ok && !(data as FundBalanceQuote).transferId) {
          setQuote(data)
        }
      } catch {
        // preview-only; review lock handles errors
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    debouncedQuotePrefetchKey,
    enteredAmount,
    amountMode,
    businessId,
    localPayInCurrency,
    residenceCountry,
    rail,
  ])

  const reviewLockKey =
    step === "review" && enteredAmount > 0
      ? [
          residenceCountry,
          localPayInCurrency,
          rail,
          amountMode,
          enteredAmount,
          isMomo ? (momoPhone.trim() || defaultPhone.trim()) : "",
          isMomo ? momoNetworkId : "",
        ].join("|")
      : ""

  const getCachedLockedQuote = useCallback((): FundBalanceQuote | null => {
    return quote?.ok && quote.transferId && quote.localPayIn > 0 ? quote : null
  }, [quote])

  const fundBalanceReviewReady = Boolean(quote?.transferId && quote.localPayIn > 0)

  const lockBeforeReview = useCallback(async (): Promise<boolean> => {
    setQuoteError(null)
    setIsContinueLoading(true)
    try {
      const locked = await confirmOrder()
      return Boolean(locked?.transferId && locked.localPayIn > 0)
    } finally {
      setIsContinueLoading(false)
    }
  }, [confirmOrder])

  useEffect(() => {
    if (step !== "momo_setup" || !isMomo) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchWithSession("/api/settings/personal")
        const data = (await res.json().catch(() => ({}))) as { personal?: { phone?: string | null } }
        if (!cancelled && res.ok) {
          const phone = String(data.personal?.phone ?? "").trim()
          setDefaultPhone(phone)
          setMomoPhone((prev) =>
            prev || (phone ? normalizeYcMomoPhone(phone, residenceCountry) : ""),
          )
        }
      } catch {
        // optional prefill
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step, isMomo, residenceCountry])

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

  const goBack = () => {
    if (step === "amount" && initialStep === "amount" && onExitToCashList) {
      onExitToCashList()
      return
    }
    if (step === "amount") setStep(bankAvailable && momoAvailable ? "rail" : "rail")
    else if (step === "momo_setup") setStep("amount")
    else if (step === "review") setStep(isMomo ? "momo_setup" : "amount")
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
    const amountLimitCheck =
      enteredAmount > 0 && customerRate
        ? validateYcFundBalancePayInAmount({
            amountEntryMode: amountMode,
            enteredAmount,
            previewLocalPayIn:
              displayPreview.estimatedTotalLocalPayIn > 0
                ? displayPreview.estimatedTotalLocalPayIn
                : displayPreview.localPayIn,
            currency: localPayInCurrency,
            limits: payInLimits,
          })
        : { ok: true as const }
    const canContinue = enteredAmount > 0 && Boolean(customerRate) && amountLimitCheck.ok
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
            <p className="text-xs text-muted-foreground">{REVIEW_ROW_LABELS.creditTo}</p>
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
                if (amountMode === "usd" && displayPreview.localPayIn > 0) {
                  setAmountMode("local")
                  setAmountStr(String(displayPreview.localPayIn))
                } else if (amountMode === "local" && displayPreview.usdCredit > 0) {
                  setAmountMode("usd")
                  setAmountStr(String(displayPreview.usdCredit))
                } else {
                  setAmountMode(amountMode === "usd" ? "local" : "usd")
                }
              }}
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-primary" />
              {amountMode === "usd"
                ? displayPreview.feeInclusive
                  ? `${REVIEW_ROW_LABELS.totalToPay}: ${formatMoneyDisplay(displayPreview.localPayIn, localPayInCurrency)}`
                  : `Pay ≈ ${formatMoneyDisplay(displayPreview.localPayIn, localPayInCurrency)}`
                : `Receive ≈ ${formatMoneyDisplay(displayPreview.usdCredit, "USD")}`}
            </button>
          ) : null}
          {!amountLimitCheck.ok ? (
            <p className="text-sm text-destructive">{amountLimitCheck.message}</p>
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
          disabled={!canContinue || isContinueLoading}
          onClick={async () => {
            setQuoteError(null)
            if (isMomo) {
              setStep("momo_setup")
              return
            }
            const locked = await lockBeforeReview()
            if (locked) setStep("review")
          }}
        >
          {isContinueLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Locking details…
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    )
  }

  if (step === "momo_setup") {
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

        <p className="text-sm font-medium">Mobile money</p>

        <div className="rounded-xl border border-border p-4 space-y-3 text-sm">
          <div>
            <Label htmlFor="momo-phone">{REVIEW_ROW_LABELS.momoNumberPrompt}</Label>
            <YcMomoPhoneInput
              id="momo-phone"
              countryCode={residenceCountry}
              value={momoPhone}
              onChange={setMomoPhone}
              className="mt-1"
              placeholder="712345678"
            />
          </div>
          <div>
            <Label>{REVIEW_ROW_LABELS.momoNetworkPrompt}</Label>
            {momoNetworksLoading ? (
              <div className="flex justify-center py-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-2">
                {momoNetworks.map((network) => (
                  <button
                    key={network.id}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      momoNetworkId === network.id ? "border-primary bg-primary/5" : "border-border"
                    }`}
                    onClick={() => setMomoNetworkId(network.id)}
                  >
                    {network.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <Button
          className="w-full"
          disabled={!momoReady || isContinueLoading}
          onClick={async () => {
            const locked = await lockBeforeReview()
            if (locked) setStep("review")
          }}
        >
          {isContinueLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Locking details…
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    )
  }

  if (step === "review") {
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

        <h2 className="text-2xl font-semibold text-foreground">{YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE}</h2>

        {quoteError ? <p className="text-sm text-destructive">{quoteError}</p> : null}

        {fundBalanceReviewReady ? (
        <YcPayInReviewSection
          flowMode="fund_balance"
          lockKey={reviewLockKey}
          getCachedLocked={getCachedLockedQuote}
          confirmOrder={async () => {
            const result = await confirmOrder()
            if (!result?.transferId) return null
            return { ...result, ok: true as const }
          }}
          getErrorMessage={() => quoteError}
          payInCurrency={localPayInCurrency}
          payInRail={rail}
          amountEntryMode={amountMode}
          enteredAmount={enteredAmount}
          previewUsdCredit={preview.usdCredit}
          previewLocalPayIn={preview.localPayIn}
          previewCustomerRate={customerRate ?? 0}
          copiedField={copiedField}
          onCopy={onCopy}
          attest={{
            onAttest: async ({ transactionId, transferId }) => {
              const res = await fetchWithSession("/api/yellowcard/pay-in/attest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transactionId, transferId }),
              })
              const data = (await res.json().catch(() => null)) as {
                ok?: boolean
                attestedAt?: string
                message?: string
              } | null
              if (!res.ok || !data?.ok || !data.attestedAt) {
                throw new Error(data?.message || "Could not confirm payment")
              }
              return { attestedAt: data.attestedAt }
            },
            onSuccess: (transactionId) => {
              router.replace(transactionWebDetailPath(transactionId, { returnTo: "dashboard" }))
            },
          }}
        />
        ) : (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    )
  }

  return null
}
