"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { PinChallengeDialog } from "@/components/app-lock/pin-challenge-dialog"
import { useAuth } from "@/lib/auth-context"
import { hasPin, isLoginPinModuleAvailable } from "@/lib/login-pin"
import {
  getGlobalPayoutTransferMethod,
  resolveSendConfirmArrivalHint,
} from "@easner/shared"
import { usePayoutFormSchema } from "@/lib/use-payout-form-schema"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { SendSelectedRecipientSummary } from "@/components/send/send-selected-recipient-summary"
import { PayoutReviewDetailsRows } from "@/components/transactions/payout-review-details-rows"
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
import {
  isWalletQuoteFresh,
  mapWalletQuoteToFlowState,
} from "@/lib/wallet-send/map-wallet-quote-to-flow"
import type { WalletSendQuoteResult } from "@/lib/wallet-send/wallet-send-quote"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"
import { ArrowLeft, Loader2 } from "lucide-react"

const SEND_FLOW_STATE_KEY_LOCAL = SEND_FLOW_STATE_KEY

function isEasenetRecipient(recipient: Beneficiary): boolean {
  return Boolean(recipient.payeeEasetag?.trim())
}

function isWalletRecipient(recipient: Beneficiary): boolean {
  return Boolean(recipient.walletNetwork) || /wallet/i.test(recipient.bankName || "")
}

function corridorTransferMethod(recipient: Beneficiary, currency: string): string {
  return getGlobalPayoutTransferMethod({
    currency,
    countryCode: recipient.countryCode,
    country: recipient.country,
    bankName: recipient.bankName,
    mobileProvider: recipient.mobileProvider,
    payeeEasetag: recipient.payeeEasetag,
  })
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
  const [walletQuoteError, setWalletQuoteError] = useState<string | null>(null)
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
  const arrivalHint = state
    ? resolveSendConfirmArrivalHint({
        isEasetag: isEasenetRecipient(state.recipient),
        isWalletSend: isWalletRecipient(state.recipient),
        processingSeconds: payoutHints?.processing_seconds,
        countryCode: state.recipient.countryCode,
        rail: payoutRail,
      })
    : null

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
    if (isPayoutQuoteFresh(state.payoutQuote, state.amount, state.recipient.id)) return
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
            amountEntryMode: state.amountEntryMode ?? "receive",
            ...(state.amountEntryMode === "send" && state.sendAmount > 0
              ? { sendAmount: state.sendAmount }
              : {}),
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
  }, [state?.recipient.id, state?.amount, state?.sendAmount, state?.amountEntryMode, state?.sendCurrency, state?.note, state?.paymentPurpose, businessId])

  useEffect(() => {
    if (!state || isEasenetRecipient(state.recipient) || !isWalletRecipient(state.recipient) || !(state.amount > 0))
      return
    if (isWalletQuoteFresh(state.walletQuote, state.amount, state.recipient.id)) return
    let cancelled = false
    setWalletQuoteError(null)
    void (async () => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (businessId) headers["X-Easner-Noah-Scope"] = "business"
        const res = await fetchWithSession("/api/wallets/send/quote", {
          method: "POST",
          headers,
          body: JSON.stringify({
            recipientId: state.recipient.id,
            sourceBalanceCurrency: state.sendCurrency,
            amountEntryMode: state.amountEntryMode ?? "receive",
            ...(state.amountEntryMode === "send" && state.sendAmount > 0
              ? { sendAmount: state.sendAmount }
              : { receiveAmount: state.amount }),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          quote?: WalletSendQuoteResult
        }
        if (!res.ok || !data.ok || !data.quote) {
          throw new Error(data.error || "Could not load wallet send quote")
        }
        if (cancelled) return
        const next = mapWalletQuoteToFlowState(state, data.quote)
        setState(next)
        sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
      } catch (e) {
        if (!cancelled) {
          setWalletQuoteError(e instanceof Error ? e.message : "Wallet send quote failed")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    state?.recipient.id,
    state?.amount,
    state?.sendAmount,
    state?.amountEntryMode,
    state?.sendCurrency,
    businessId,
  ])

  const quoteCountdown = useQuoteCountdown(
    state?.walletQuote?.expiresAt ?? state?.payoutQuote?.expiresAt,
  )

  const finishSend = (transactionId: string) => {
    if (!state) return
    sessionStorage.removeItem(SEND_FLOW_STATE_KEY_LOCAL)
    router.push(transactionWebDetailPath(transactionId))
    void refetchBusinessMoneyQueries(qc, scope)
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
          "Idempotency-Key": `biz-easetag-${plannedEtid || state.transactionId || Date.now()}`,
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
      const wq = state.walletQuote
      if (!wq?.formSessionId) {
        setAuthorizeError(walletQuoteError || "Wallet send quote is not ready. Go back and try again.")
        return
      }
      if (wq.recipientId && wq.recipientId !== state.recipient.id) {
        setAuthorizeError("Wallet quote doesn't match this recipient. Go back and tap Continue again.")
        return
      }

      setIsAuthorizing(true)
      try {
        const scopeHeaders: Record<string, string> = {}
        if (businessId) scopeHeaders["X-Easner-Noah-Scope"] = "business"

        const walletEtid =
          typeof state.transactionId === "string" &&
          isEasnerClientTransactionIdFormat(state.transactionId)
            ? state.transactionId.trim().toUpperCase()
            : ""

        const receiveNetwork = state.recipient.walletNetwork?.trim() || wq.receiveNetwork
        const reviewSnapshot = {
          you_send_amount: wq.sendAmount,
          total_debited: wq.totalDebited,
          exchange_fee: wq.channelCost,
          processing_fee: wq.marginAmount,
          network_fee: wq.networkFee,
          exchange_rate: wq.customerRate,
          send_currency: state.sendCurrency,
          receive_amount: state.amount,
          receive_currency: state.receiveCurrency,
          transfer_method: `${state.receiveCurrency} on ${receiveNetwork}`,
          processing_time: arrivalHint ?? undefined,
        }

        const res = await fetchWithSession("/api/wallets/send/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(walletEtid ? { "Idempotency-Key": walletEtid } : {}),
            ...scopeHeaders,
          },
          body: JSON.stringify({
            recipientId: state.recipient.id,
            formSessionId: wq.formSessionId,
            ...(walletEtid ? { reservedDebitEtid: walletEtid } : {}),
            reviewSnapshot,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          easner_transaction_id?: string
          transaction_id?: string
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Wallet send failed")
        }

        const transactionId = String(
          data.easner_transaction_id ?? data.transaction_id ?? state.transactionId ?? generateTransactionId(),
        ).trim()
        if (user?.id) {
          dataCache.invalidate(CACHE_KEYS.TRANSACTIONS_LIST(user.id))
        }
        requestBusinessAccountsRefresh()
        await finishSend(transactionId)
      } catch (e) {
        setAuthorizeError(e instanceof Error ? e.message : "Wallet send failed")
      } finally {
        setIsAuthorizing(false)
      }
      return
    }

    const pq = state.payoutQuote
    if (!pq?.formSessionId) {
      setAuthorizeError(payoutQuoteError || "Payout quote is not ready. Go back and try again.")
      return
    }
    if (pq.recipientId && pq.recipientId !== state.recipient.id) {
      setAuthorizeError("Payout quote doesn't match this recipient. Go back and tap Continue again.")
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

      const transferMethod = corridorTransferMethod(state.recipient, state.receiveCurrency)
      const processingTime = arrivalHint ?? undefined
      const reviewYouSend = pq!.customerPrincipal ?? pq!.sendAmount
      const reviewExchangeRate = pq!.midRate && pq!.midRate > 0 ? pq!.midRate : 1
      const reviewExchangeFee = pq!.channelCost ?? pq!.noahFee ?? 0
      const reviewMargin = pq!.marginAmount ?? pq!.easnerFee ?? 0
      const reviewSnapshot = {
        you_send_amount: reviewYouSend,
        total_debited: pq!.totalDebited,
        exchange_fee: reviewExchangeFee,
        processing_fee: reviewMargin,
        exchange_rate: reviewExchangeRate,
        send_currency: state.sendCurrency,
        receive_amount: state.amount,
        receive_currency: state.receiveCurrency,
        transfer_method: transferMethod,
        processing_time: processingTime,
        ...(reviewMargin > 0 ? { margin_amount: reviewMargin, easner_fee: reviewMargin } : {}),
        ...(reviewExchangeFee > 0 ? { channel_cost: reviewExchangeFee } : {}),
        ...(pq!.noahFloor ? { noah_floor: Number(pq!.noahFloor) } : {}),
        ...(pq!.noahSendAmount ? { noah_send_amount: Number(pq!.noahSendAmount) } : {}),
      }

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
        ...(pq.noahFloor ? { noahFloor: pq.noahFloor } : {}),
        ...(pq.noahSendAmount ? { noahSendAmount: pq.noahSendAmount } : {}),
        totalDebited: String(pq.totalDebited),
        ...(pq.marginAmount != null ? { marginAmount: String(pq.marginAmount) } : {}),
        ...(pq.marginCaptureMode ? { marginCaptureMode: pq.marginCaptureMode } : {}),
        ...(pq.midRate != null ? { customerRate: pq.midRate } : {}),
        ...(pq.noahMid != null ? { noahMid: pq.noahMid } : {}),
        reviewSnapshot,
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
  const transferMethod = corridorTransferMethod(state.recipient, state.receiveCurrency)
  const easenetSend = isEasenetRecipient(state.recipient)
  const walletSend = isWalletRecipient(state.recipient)
  const hasFx =
    !easenetSend &&
    state.receiveCurrency.toUpperCase() !== state.sendCurrency.toUpperCase()
  const pq = state.payoutQuote
  const wq = state.walletQuote
  const quoteReady =
    easenetSend ||
    (walletSend
      ? isWalletQuoteFresh(wq, state.amount, state.recipient.id)
      : isPayoutQuoteFresh(pq, state.amount, state.recipient.id))
  const easnerFee = walletSend
    ? (wq?.marginAmount ?? 0)
    : (pq?.marginAmount ?? pq?.easnerFee ?? 0)
  const easnerFeeCurrency = walletSend
    ? state.sendCurrency
    : (pq?.easnerFeeCurrency ?? state.sendCurrency)
  const youSendAmount = walletSend
    ? (wq?.sendAmount ?? state.sendAmount)
    : (pq?.customerPrincipal ?? pq?.sendAmount ?? state.sendAmount)
  const exchangeRate =
    hasFx && (walletSend ? wq?.customerRate : pq?.midRate) &&
    (walletSend ? wq!.customerRate : pq!.midRate!) > 0
      ? walletSend
        ? wq!.customerRate
        : pq!.midRate!
      : 1
  const exchangeFee = walletSend ? (wq?.channelCost ?? 0) : (pq?.channelCost ?? pq?.noahFee ?? 0)
  const networkFee = walletSend ? (wq?.networkFee ?? 0) : 0
  const totalDebited = walletSend
    ? (wq?.totalDebited ?? state.sendAmount)
    : (pq?.totalDebited ?? state.sendAmount)
  const walletTransferMethod = walletSend
    ? `${state.receiveCurrency} on ${state.recipient.walletNetwork?.trim() || wq?.receiveNetwork || "wallet"}`
    : transferMethod
  const authorizeDisabled =
    isAuthorizing ||
    Boolean((walletSend ? walletQuoteError : payoutQuoteError) && !easenetSend) ||
    (!easenetSend && (!quoteReady || quoteCountdown.expired))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Review transfer</h1>
      </div>

      <PayoutReviewDetailsRows
        transactionId={displayTransactionId}
        payoutReview={{
          you_send_amount: youSendAmount,
          total_debited: totalDebited,
          exchange_fee: exchangeFee,
          processing_fee: easnerFee,
          network_fee: networkFee,
          exchange_rate: exchangeRate,
          send_currency: state.sendCurrency,
          receive_amount: state.amount,
          receive_currency: state.receiveCurrency,
          transfer_method: walletTransferMethod,
          processing_time: arrivalHint ?? "",
        }}
        recipientNode={
          <SendSelectedRecipientSummary
            beneficiary={state.recipient}
            alignEnd
            className="min-w-0 max-w-[70%] shrink-0"
          />
        }
        sourceAccountCurrency={
          sourceAccount && state.paymentMethod === "balance" ? sourceAccount.currency : null
        }
        copiedKey={copiedKey}
        onCopy={handleCopy}
        showFeeBreakdown={!easenetSend && quoteReady}
      />

      {(walletSend ? walletQuoteError : payoutQuoteError) && !easenetSend ? (
        <p className="text-sm text-destructive">{walletSend ? walletQuoteError : payoutQuoteError}</p>
      ) : null}
      {!easenetSend && (wq?.expiresAt || pq?.expiresAt) ? (
        <div className="text-xs text-muted-foreground">
          {quoteCountdown.expired
            ? "Quote expired — go back and continue again for a fresh quote."
            : `Quote valid for ${quoteCountdown.label}`}
        </div>
      ) : null}

      {authorizeError ? (
        <p className="text-sm text-red-600" role="alert">
          {authorizeError}
        </p>
      ) : null}

      {state.note && !walletSend && (
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
