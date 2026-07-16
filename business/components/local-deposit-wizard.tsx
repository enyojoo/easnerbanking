"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  formatReviewRowMoneyDisplay,
  formatSendRateLabel,
  computeDisplayProcessingFee,
  mapResidenceToLocalPayInCurrency,
  resolveYcPayInCustomerRate,
  ycFundBalanceQuoteErrorMessage,
  ycPayInInstructionNotice,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  formatYcPayInMinHint,
  validateYcFundBalancePayInAmount,
  REVIEW_ROW_LABELS,
  computeYcFundBalancePrincipalLocalPayIn,
  shouldShowPayoutReviewFeeRow,
  normalizeYcMomoPhone,
  type NgLocalIdType,
  type YcRateClientRow,
} from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { NgLocalVerificationNotice } from "@/components/compliance/ng-local-verification-notice"
import { YcCompleteDepositPanel } from "@/components/yc-complete-deposit-panel"
import { YcMomoPhoneInput } from "@/components/yc-momo-phone-input"
import { CreditDestinationRow } from "@/components/transactions/credit-destination-row"
import { TransactionDetailSummaryRow } from "@/components/transactions/transaction-detail-summary-row"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"
import { useWalletBalances } from "@/hooks/queries/use-wallets"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useYcPayInMinEnforcement } from "@/hooks/use-yc-pay-in-min-enforcement"

type LocalRail = "bank_transfer" | "mobile_money"
type WizardStep = "rail" | "amount" | "review" | "payin"
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
  const [prefetchedQuote, setPrefetchedQuote] = useState<FundBalanceQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
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

  const isMomo = rail === "mobile_money"

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
    if (readCachedYcPayInNetworks(residenceCountry, localPayInCurrency)?.length) return
    void prefetchYcPayInNetworks(residenceCountry, localPayInCurrency)
  }, [isMomo, residenceCountry, localPayInCurrency])

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

  const createQuote = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setQuoteLoading(true)
      setQuoteError(null)
    }
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
        if (!opts?.silent) setQuoteError(msg)
        return null
      }
      if (!opts?.silent) setQuote(data)
      return data
    } catch {
      if (!opts?.silent) setQuoteError("Could not get payment details")
      return null
    } finally {
      if (!opts?.silent) setQuoteLoading(false)
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

  useEffect(() => {
    if (step !== "review" || !isMomo) return
    let cancelled = false
    const cached = readCachedYcPayInNetworks(residenceCountry, localPayInCurrency)
    if (cached?.length) {
      setMomoNetworks(cached)
      if (cached.length === 1) setMomoNetworkId(cached[0].id)
    } else {
      setMomoNetworksLoading(true)
    }
    void (async () => {
      try {
        const res = await prefetchYcPayInNetworks(residenceCountry, localPayInCurrency)
        if (!cancelled) {
          setMomoNetworks(res)
          if (res.length === 1) setMomoNetworkId(res[0].id)
        }
      } finally {
        if (!cancelled) setMomoNetworksLoading(false)
      }
    })()
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
  }, [step, isMomo, residenceCountry, localPayInCurrency])

  const quotePrefetchKey =
    !isMomo &&
    step === "amount" &&
    enteredAmount > 0 &&
    customerRate
      ? [
          residenceCountry,
          localPayInCurrency,
          rail,
          amountMode,
          enteredAmount,
        ].join("|")
      : ""

  useEffect(() => {
    if (!quotePrefetchKey) {
      setPrefetchedQuote(null)
      return
    }
    let cancelled = false
    void (async () => {
      const result = await createQuote({ silent: true })
      if (!cancelled && result) setPrefetchedQuote(result)
    })()
    return () => {
      cancelled = true
    }
  }, [quotePrefetchKey, createQuote])

  useEffect(() => {
    if (step !== "review" || isMomo) return
    if (quote?.transferId) return
    if (prefetchedQuote?.transferId) {
      setQuote(prefetchedQuote)
      setQuoteError(null)
      setQuoteLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const result = await createQuote()
      if (!cancelled && !result) setQuote(null)
    })()
    return () => {
      cancelled = true
    }
  }, [step, quote?.transferId, prefetchedQuote, createQuote, isMomo])

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
    const amountLimitCheck =
      enteredAmount > 0 && customerRate
        ? validateYcFundBalancePayInAmount({
            amountEntryMode: amountMode,
            enteredAmount,
            previewLocalPayIn: preview.localPayIn,
            currency: localPayInCurrency,
            limits: payInLimits,
          })
        : { ok: true as const }
    const minDepositHint =
      payInLimits.minLocalPayIn != null && customerRate
        ? formatYcPayInMinHint({
            minLocalPayIn: payInLimits.minLocalPayIn,
            currency: localPayInCurrency,
            customerSellRate: customerRate,
          })
        : null
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
          ) : minDepositHint ? (
            <p className="text-sm text-muted-foreground">{minDepositHint}</p>
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
          disabled={!canContinue}
          onClick={async () => {
            setQuoteError(null)
            if (isMomo) {
              const cached = readCachedYcPayInNetworks(residenceCountry, localPayInCurrency)
              if (!cached?.length) setMomoNetworksLoading(true)
              try {
                const res = await prefetchYcPayInNetworks(residenceCountry, localPayInCurrency)
                setMomoNetworks(res)
                if (res.length === 1) setMomoNetworkId(res[0].id)
              } catch {
                setQuoteError("Could not load mobile money networks")
                return
              } finally {
                setMomoNetworksLoading(false)
              }
              setQuote(null)
              setStep("review")
              return
            }
            if (prefetchedQuote?.transferId) {
              setQuote(prefetchedQuote)
              setStep("review")
              return
            }
            setQuote(null)
            const result = await createQuote()
            if (result) setStep("review")
          }}
        >
          Continue
        </Button>
      </div>
    )
  }

  if (step === "review") {
    const transferMethod = rail === "mobile_money" ? "Mobile Money" : "Bank Transfer"
    const reviewLocalPayIn = isMomo ? preview.localPayIn : (quote?.localPayIn ?? 0)
    const reviewUsdCredit = isMomo ? preview.usdCredit : (quote?.usdCredit ?? 0)
    const reviewCustomerRate = isMomo ? customerRate : (quote?.customerRate ?? customerRate)
    const reviewFeeLocal =
      !isMomo && quote
        ? quote.displayProcessingFeeLocal ??
          (quote.displayProcessingFee != null && reviewCustomerRate
            ? Math.round(quote.displayProcessingFee * reviewCustomerRate * 100) / 100
            : computeDisplayProcessingFee({
                processingFee: quote.processingFee ?? 0,
                exchangeFee: quote.ycChannelFeeUsd ?? 0,
              }) * (reviewCustomerRate || 1))
        : isMomo && reviewCustomerRate > 0 && reviewLocalPayIn > 0
          ? Math.max(
              0,
              Math.round((reviewLocalPayIn - reviewUsdCredit * reviewCustomerRate) * 100) / 100,
            )
          : 0
    const reviewPrincipalLocal = computeYcFundBalancePrincipalLocalPayIn({
      usdCredit: reviewUsdCredit,
      exchangeRate: reviewCustomerRate,
    })
    const payAmountLabel = isMomo ? REVIEW_ROW_LABELS.estimatedToPay : REVIEW_ROW_LABELS.totalToPay
    const creditAmountLabel = REVIEW_ROW_LABELS.amountToCredit
    const showReviewFee =
      reviewFeeLocal > 0 ||
      (!isMomo &&
        shouldShowPayoutReviewFeeRow({
          processingFee: quote?.processingFee ?? 0,
          exchangeFee: quote?.ycChannelFeeUsd ?? quote?.ycLegFeesUsd ?? 0,
        }))
    const momoReady = Boolean((momoPhone.trim() || defaultPhone.trim()) && momoNetworkId)
    const reviewReady = isMomo
      ? Boolean(reviewCustomerRate && reviewLocalPayIn > 0 && momoReady)
      : Boolean(quote?.transferId)
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
          {!isMomo && quoteLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : reviewReady ? (
            <>
              {!isMomo && (quote?.easnerTransactionId ?? quote?.transactionId) ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.transactionId}
                  value={(quote!.easnerTransactionId ?? quote!.transactionId)!.toUpperCase()}
                  valueClassName="font-mono"
                />
              ) : null}
              {reviewCustomerRate ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.exchangeRate}
                  value={formatSendRateLabel("USD", localPayInCurrency, reviewCustomerRate)}
                />
              ) : null}
              {reviewPrincipalLocal > 0 ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.depositAmount}
                  value={formatReviewRowMoneyDisplay(
                    REVIEW_ROW_LABELS.depositAmount,
                    reviewPrincipalLocal,
                    localPayInCurrency,
                  )}
                />
              ) : null}
              {showReviewFee && reviewFeeLocal > 0 ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.processingFee}
                  value={formatReviewRowMoneyDisplay(
                    REVIEW_ROW_LABELS.processingFee,
                    reviewFeeLocal,
                    localPayInCurrency,
                  )}
                />
              ) : null}
              <TransactionDetailSummaryRow
                label={payAmountLabel}
                value={formatReviewRowMoneyDisplay(payAmountLabel, reviewLocalPayIn, localPayInCurrency)}
                valueClassName="font-semibold"
              />
              <TransactionDetailSummaryRow
                label={creditAmountLabel}
                value={formatReviewRowMoneyDisplay(creditAmountLabel, reviewUsdCredit, "USD")}
                valueClassName="font-semibold"
              />
              <CreditDestinationRow
                label={REVIEW_ROW_LABELS.creditTo}
                currency="USD"
                balanceLabel="USD Balance"
              />
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.transferMethod}
                value={transferMethod}
              />
              {!isMomo && quote?.expiresAt ? (
                <p className="text-xs text-muted-foreground pt-1">
                  {quoteCountdown.expired
                    ? "Quote expired — go back and continue again."
                    : `Quote valid for ${quoteCountdown.label}`}
                </p>
              ) : null}
            </>
          ) : null}
          {isMomo ? (
            <div className="pt-4 space-y-3">
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
          ) : null}
          {quoteError ? <p className="text-sm text-destructive">{quoteError}</p> : null}
        </div>

        <Button
          className="w-full"
          disabled={
            !reviewReady ||
            quoteLoading ||
            (!isMomo && (quoteCountdown.expired || !quote?.transferId))
          }
          onClick={async () => {
            if (isMomo) {
              const result = await createQuote()
              if (result?.transferId) setStep("payin")
              return
            }
            setStep("payin")
          }}
        >
          Continue
        </Button>
      </div>
    )
  }

  if (step !== "payin") {
    return null
  }

  const feeLocal =
    quote?.displayProcessingFeeLocal ??
    (quote?.displayProcessingFee != null && customerRate
      ? Math.round(quote.displayProcessingFee * customerRate * 100) / 100
      : 0)
  const reviewCustomerRate = quote?.customerRate ?? customerRate
  const payInNotice = quote?.payInNotice ?? ycPayInInstructionNotice(rail)

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

      {quote?.transactionId ? (
        <YcCompleteDepositPanel
          flowMode="fund_balance"
          transactionId={quote.transactionId}
          localPayIn={quote.localPayIn ?? preview.localPayIn}
          localCurrency={localPayInCurrency}
          creditOrReceiveAmount={quote.usdCredit ?? preview.usdCredit}
          creditOrReceiveCurrency="USD"
          customerRate={reviewCustomerRate ?? customerRate ?? 0}
          processingFeeLocal={feeLocal}
          payInRail={rail}
          bankInfo={quote.bankInfo}
          sourcePhone={quote.sourcePhone}
          sourceNetworkName={quote.sourceNetworkName}
          payInNotice={payInNotice}
          copiedField={copiedField}
          onCopy={onCopy}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Loading quote…</p>
      )}
    </div>
  )
}
