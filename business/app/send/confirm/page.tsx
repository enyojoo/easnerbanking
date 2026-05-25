"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { Card, CardContent } from "@/components/ui/card"
import { PinChallengeDialog } from "@/components/app-lock/pin-challenge-dialog"
import { useAuth } from "@/lib/auth-context"
import { hasPin, isLoginPinModuleAvailable } from "@/lib/login-pin"
import {
  computeBalancePayoutExchangeFee,
  formatMoneyDisplay,
  formatPayoutArrivalHint,
  formatSendRateLabel,
} from "@easner/shared"
import { usePayoutFormSchema } from "@/lib/use-payout-form-schema"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { CurrencyFlag } from "@/components/flags"
import { SendSelectedRecipientSummary } from "@/components/send/send-selected-recipient-summary"
import { generateTransactionId, isEasnerClientTransactionIdFormat } from "@/lib/transaction-id"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { dataCache, CACHE_KEYS, requestBusinessAccountsRefresh } from "@/lib/cache"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { refetchBusinessMoneyQueries } from "@/lib/query/refresh-after-money-move"
import { useScope } from "@/lib/query/scope"
import { type SendFlowState, SEND_FLOW_STATE_KEY } from "@/lib/send-flow-session"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import {
  isPayoutQuoteFresh,
  mapPayoutQuoteToFlowState,
} from "@/lib/noah/map-payout-quote-to-flow"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"
import { ArrowLeft, Copy, Check, Loader2 } from "lucide-react"

const SEND_FLOW_STATE_KEY_LOCAL = SEND_FLOW_STATE_KEY

function isEasenetRecipient(recipient: Beneficiary): boolean {
  return Boolean(recipient.payeeEasetag?.trim())
}

function isWalletRecipient(recipient: Beneficiary): boolean {
  return Boolean(recipient.walletNetwork) || /wallet/i.test(recipient.bankName || "")
}

function getTransferMethod(recipient: Beneficiary, currency: string): string {
  if (isEasenetRecipient(recipient)) return "Easetag (wallet-to-wallet)"
  if (currency === "USD" && recipient.country === "United States") return "ACH"
  if (currency === "EUR") return "SEPA"
  if (currency === "GBP" && recipient.country === "United Kingdom") return "Faster Payments"
  return "Wire Transfer"
}

function getProcessingTime(method: string): string {
  switch (method) {
    case "Easetag (wallet-to-wallet)":
      return "Usually instant"
    case "ACH":
      return "1-3 business days"
    case "SEPA":
      return "1-2 business days"
    case "Faster Payments":
      return "Within minutes"
    default:
      return "Same day"
  }
}

export default function SendConfirmPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { scope } = useScope()
  const { user } = useAuth()
  const { tier1Complete, isLoading: profileLoading, businessId } = useBusinessProfile()
  const { accountRows: sourceAccounts } = useBusinessAccountRows()
  const [state, setState] = useState<SendFlowState | null>(null)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [authorizeError, setAuthorizeError] = useState<string | null>(null)
  const [payoutQuoteError, setPayoutQuoteError] = useState<string | null>(null)
  const displayIdFallbackRef = useRef<string | null>(null)

  const displayTransactionId = useMemo(() => {
    const s = state?.transactionId?.trim()
    if (s) return s.toUpperCase()
    if (!displayIdFallbackRef.current) displayIdFallbackRef.current = generateTransactionId()
    return displayIdFallbackRef.current
  }, [state?.transactionId])

  const payoutRail =
    state && (/mobile money/i.test(state.recipient.bankName || "") || state.recipient.mobileProvider)
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)
  const { hints: payoutHints } = usePayoutFormSchema({
    countryCode: state?.recipient.countryCode,
    currencyCode: state?.receiveCurrency,
    rail: payoutRail,
  })
  const arrivalHint = formatPayoutArrivalHint(payoutHints?.processing_seconds)

  const needPinChallenge =
    !!user?.id && isLoginPinModuleAvailable() && hasPin(user.id)

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const raw = sessionStorage.getItem(SEND_FLOW_STATE_KEY_LOCAL)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as SendFlowState
        if (parsed.paymentMethod && parsed.paymentMethod !== "balance") {
          router.replace("/send")
          return
        }
        if (!parsed.sourceAccountId) {
          router.replace("/send")
          return
        }
        setState({
          ...parsed,
          recipient: coerceBeneficiaryEasenetDisplay(parsed.recipient),
        })
      } catch {
        router.replace("/send")
      }
    } else {
      router.replace("/send")
    }
  }, [router])

  useEffect(() => {
    if (profileLoading) return
    if (state && !tier1Complete) {
      router.replace("/send")
    }
  }, [profileLoading, tier1Complete, state, router])

  useEffect(() => {
    if (!state || isEasenetRecipient(state.recipient) || isWalletRecipient(state.recipient) || !(state.amount > 0))
      return
    if (isPayoutQuoteFresh(state.payoutQuote, state.amount)) return
    let cancelled = false
    setPayoutQuoteError(null)
    void (async () => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (businessId) headers["X-Easner-Noah-Scope"] = "business"
        const res = await fetchWithSession("/api/noah/payouts/quote", {
          method: "POST",
          headers,
          body: JSON.stringify({
            recipientId: state.recipient.id,
            receiveAmount: state.amount,
            sourceBalanceCurrency: state.sendCurrency,
            ...(state.note ? { note: state.note } : {}),
            ...(state.paymentPurpose ? { paymentPurpose: state.paymentPurpose } : {}),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          quote?: {
            receiveAmount: number
            sendAmount: number
            sendCurrency: string
            totalDebited: number
            channelId?: string
            noah: { totalFee: number; formSessionId: string; cryptoAuthorizedAmount: string; cryptoCurrency: string; rate?: number }
            easner: { quoteId: string; expiresAt: string; effectiveRate?: number }
            pricingQuoteId: string
            expiresAt: string
          }
        }
        if (!res.ok || !data.ok || !data.quote) {
          throw new Error(data.error || "Could not load payout quote")
        }
        if (cancelled) return
        const next = mapPayoutQuoteToFlowState(state, data.quote as PayoutQuoteResult)
        setState(next)
        sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
      } catch (e) {
        if (!cancelled) {
          setPayoutQuoteError(e instanceof Error ? e.message : "Payout quote failed")
        }
      } finally {
        // silent background refresh — no blocking UI
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state?.recipient.id, state?.amount, state?.sendCurrency, state?.note, state?.paymentPurpose, businessId])

  const quoteCountdown = useQuoteCountdown(state?.payoutQuote?.expiresAt)

  const finishSend = async (transactionId: string) => {
    if (!state) return
    sessionStorage.removeItem(SEND_FLOW_STATE_KEY_LOCAL)
    await refetchBusinessMoneyQueries(qc, scope)
    router.push(transactionWebDetailPath(transactionId))
  }

  const handleAuthorizeSuccess = async () => {
    if (!state) return
    setAuthorizeError(null)

    if (isEasenetRecipient(state.recipient)) {
      setIsAuthorizing(true)
      try {
        const tag = state.recipient.payeeEasetag!.trim().replace(/^@+/, "")
        const plannedEtid =
          typeof state.transactionId === "string" &&
          isEasnerClientTransactionIdFormat(state.transactionId)
            ? state.transactionId.trim().toUpperCase()
            : ""
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Idempotency-Key: `biz-easetag-${plannedEtid || state.transactionId || Date.now()}`,
        }
        if (businessId) {
          headers["X-Easner-Noah-Scope"] = "business"
        }
        const res = await fetchWithSession("/api/wallets/easetag-transfer", {
          method: "POST",
          headers,
          body: JSON.stringify({
            destination_easetag: tag,
            amount: state.sendAmount,
            currency: state.sendCurrency.toUpperCase(),
            ...(plannedEtid ? { reserved_debit_etid: plannedEtid } : {}),
            ...(state.note ? { note: state.note } : {}),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          hint?: string
          transaction?: Record<string, unknown>
          debit_provider_transaction_id?: string
          transfer_group_id?: string
          easner_transaction_id?: string
        }
        if (!res.ok || !data.ok) {
          const err = typeof data.error === "string" ? data.error : "Easetag transfer failed"
          const hint = typeof data.hint === "string" ? data.hint : ""
          setAuthorizeError(hint ? `${err} — ${hint}` : err)
          return
        }
        const serverEtid = String(data.easner_transaction_id ?? "").trim().toUpperCase()
        const planned = plannedEtid || String(state.transactionId ?? "").trim().toUpperCase()
        const id = String(
          serverEtid ||
            data.debit_provider_transaction_id ||
            data.transfer_group_id ||
            planned ||
            generateTransactionId(),
        )
        if (user?.id) {
          dataCache.invalidate(CACHE_KEYS.TRANSACTIONS_LIST(user.id))
        }
        requestBusinessAccountsRefresh()
        await finishSend(id)
      } catch (e) {
        setAuthorizeError(e instanceof Error ? e.message : "Transfer failed")
      } finally {
        setIsAuthorizing(false)
      }
      return
    }

    if (isWalletRecipient(state.recipient)) {
      setAuthorizeError(
        "Wallet address recipients cannot be paid from your USD/EUR balance. Use crypto send or another method.",
      )
      return
    }

    const pq = state.payoutQuote
    if (!pq?.formSessionId) {
      setAuthorizeError(payoutQuoteError || "Payout quote is not ready. Go back and try again.")
      return
    }

    setIsAuthorizing(true)
    try {
      const scopeHeaders: Record<string, string> = {}
      if (businessId) scopeHeaders["X-Easner-Noah-Scope"] = "business"

      const payoutEtid =
        typeof state.transactionId === "string" &&
        isEasnerClientTransactionIdFormat(state.transactionId)
          ? state.transactionId.trim().toUpperCase()
          : ""

      const transferBody = {
        amount: state.amount.toFixed(2),
        currency: state.receiveCurrency.toLowerCase(),
        formSessionId: pq.formSessionId,
        cryptoAuthorizedAmount: pq.cryptoAuthorizedAmount,
        cryptoCurrency: pq.cryptoCurrency,
        countryCode: state.recipient.countryCode?.toUpperCase(),
        ...(state.payoutQuote?.channelId ? { channelId: state.payoutQuote.channelId } : {}),
        recipientId: state.recipient.id,
        ...(payoutEtid ? { reservedDebitEtid: payoutEtid } : {}),
        ...(state.note ? { note: state.note } : {}),
        ...(state.paymentPurpose ? { paymentPurpose: state.paymentPurpose } : {}),
      }

      const transferRes = await fetchWithSession("/api/noah/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(payoutEtid ? { "Idempotency-Key": payoutEtid } : {}),
          ...scopeHeaders,
        },
        body: JSON.stringify(transferBody),
      })
      const transferData = (await transferRes.json().catch(() => ({}))) as {
        error?: string
        easner_transaction_id?: string
        transaction_id?: string
        id?: string
      }
      if (!transferRes.ok) {
        throw new Error(transferData.error || "Transfer failed")
      }

      const providerTxId = String(
        transferData.easner_transaction_id ?? transferData.transaction_id ?? transferData.id ?? "",
      ).trim()

      const transactionId =
        providerTxId ||
        state.transactionId ||
        generateTransactionId()
      if (user?.id) {
        dataCache.invalidate(CACHE_KEYS.TRANSACTIONS_LIST(user.id))
      }
      requestBusinessAccountsRefresh()
      await finishSend(transactionId)
    } catch (e) {
      setAuthorizeError(e instanceof Error ? e.message : "Transfer failed")
    } finally {
      setIsAuthorizing(false)
    }
  }

  const onAuthorizeClick = () => {
    setAuthorizeError(null)
    if (needPinChallenge) {
      setShowPinDialog(true)
      return
    }
    if (typeof window !== "undefined" && isLoginPinModuleAvailable() && user?.id && !hasPin(user.id)) {
      window.alert("Set an app PIN in Settings before authorizing transfers.")
      return
    }
    void handleAuthorizeSuccess()
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
        </div>
      </div>
    )
  }

  const sourceAccount = sourceAccounts.find((a) => a.id === state.sourceAccountId!)
  const transferMethod = getTransferMethod(state.recipient, state.receiveCurrency)
  const processingTime = arrivalHint ?? getProcessingTime(transferMethod)
  const easenetSend = isEasenetRecipient(state.recipient)
  const hasFx = !easenetSend && state.receiveCurrency !== state.sendCurrency
  const pq = state.payoutQuote
  const quoteReady = easenetSend || Boolean(pq?.formSessionId)
  const easnerFee = pq?.easnerFee ?? 0
  const easnerFeeCurrency = pq?.easnerFeeCurrency ?? state.sendCurrency
  const exchangeFee = computeBalancePayoutExchangeFee(
    pq?.totalDebited ?? 0,
    state.sendAmount,
    easnerFee,
  )
  const exchangeRate =
    hasFx && state.amount > 0 ? state.sendAmount / state.amount : 1

  const authorizeDisabled =
    isAuthorizing ||
    Boolean(payoutQuoteError && !easenetSend) ||
    (!easenetSend && (!quoteReady || quoteCountdown.expired))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Review transfer</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-2 border-b pb-4">
            <span className="text-sm text-muted-foreground">Transaction ID</span>
            <button
              type="button"
              className="flex items-center gap-2 font-mono text-sm font-medium transition-colors hover:text-primary"
              onClick={() => {
                void handleCopy(displayTransactionId, "transactionId")
              }}
              aria-label="Copy transaction id"
            >
              {displayTransactionId}
              {copiedKey === "transactionId" ? (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Copy className="h-4 w-4 shrink-0" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">You send</span>
            <span className="text-xl font-semibold">
              {formatMoneyDisplay(state.sendAmount, state.sendCurrency)}
            </span>
          </div>
          {sourceAccount && state.paymentMethod === "balance" ? (
            <div className="flex items-center justify-between border-b pb-4">
              <span className="text-sm text-muted-foreground">From</span>
              <div className="flex shrink-0 items-center gap-2 font-medium">
                <CurrencyFlag currency={sourceAccount.currency} size={22} className="shrink-0" />
                <span>{sourceAccount.currency} Balance</span>
              </div>
            </div>
          ) : null}
          {!easenetSend && quoteReady ? (
            <>
              <div className="flex items-center justify-between border-b pb-4">
                <span className="text-sm text-muted-foreground">Exchange fee</span>
                <span className="font-semibold">
                  {formatMoneyDisplay(exchangeFee, state.sendCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-4">
                <span className="text-sm text-muted-foreground">Processing fee</span>
                <span className="font-semibold">
                  {formatMoneyDisplay(easnerFee, easnerFeeCurrency)}
                </span>
              </div>
              {hasFx ? (
                <div className="flex items-center justify-between border-b pb-4">
                  <span className="text-sm text-muted-foreground">Exchange rate</span>
                  <span className="font-semibold">
                    {formatSendRateLabel(state.sendCurrency, state.receiveCurrency, exchangeRate)}
                  </span>
                </div>
              ) : null}
              {!easenetSend && (pq?.totalDebited ?? 0) > 0 ? (
                <div className="flex items-center justify-between border-b pb-4">
                  <span className="text-sm text-muted-foreground">Total debited</span>
                  <span className="text-xl font-semibold">
                    {formatMoneyDisplay(pq!.totalDebited, state.sendCurrency)}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">Recipient gets</span>
            <span className="font-semibold">
              {formatMoneyDisplay(state.amount, state.receiveCurrency)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-b pb-4">
            <span className="shrink-0 text-sm text-muted-foreground">Recipient</span>
            <SendSelectedRecipientSummary
              beneficiary={state.recipient}
              alignEnd
              className="min-w-0 max-w-[70%] shrink-0"
            />
          </div>
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">Transfer method</span>
            <span className="font-medium">{transferMethod}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">Processing time</span>
            <span className="font-medium">{processingTime}</span>
          </div>
          {payoutQuoteError && !easenetSend ? (
            <p className="text-sm text-destructive">{payoutQuoteError}</p>
          ) : null}
          {!easenetSend && pq?.expiresAt ? (
            <div className="text-xs text-muted-foreground">
              {quoteCountdown.expired
                ? "Quote expired — go back and continue again for a fresh quote."
                : `Quote valid for ${quoteCountdown.label}`}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {authorizeError ? (
        <p className="text-sm text-red-600" role="alert">
          {authorizeError}
        </p>
      ) : null}

      {state.note && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-1 text-sm text-muted-foreground">Note</p>
            <p className="text-sm">{state.note}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="h-11" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button size="lg" className="h-11 flex-1" onClick={onAuthorizeClick} disabled={authorizeDisabled}>
          {isAuthorizing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Authorize transfer"
          )}
        </Button>
      </div>

      {user?.id ? (
        <PinChallengeDialog
          open={showPinDialog}
          onOpenChange={setShowPinDialog}
          userId={user.id}
          onVerified={() => {
            void handleAuthorizeSuccess()
          }}
        />
      ) : null}
    </div>
  )
}
