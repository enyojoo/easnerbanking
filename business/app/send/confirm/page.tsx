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
  formatWalletSendTransferMethod,
  getGlobalPayoutTransferMethod,
  hasWalletSendFxDisplay,
  resolvePayoutCountryCode,
  resolveRecipientPayoutRail,
  resolveSendConfirmArrivalHint,
  SEND_REVIEW_CONFIRM_CTA,
  YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE,
  attestPayInPayment,
  shouldShowPayoutReviewFeeRow,
} from "@easner/shared"
import { usePayoutFormSchema } from "@/lib/use-payout-form-schema"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { isDraftRecipientId, resolveDraftRecipient } from "@/lib/draft-recipient"
import { SendSelectedRecipientSummary } from "@/components/send/send-selected-recipient-summary"
import { PayoutReviewDetailsRows } from "@/components/transactions/payout-review-details-rows"
import { YcPayInReviewSection } from "@/components/yc/yc-pay-in-review-section"
import { generateTransactionId, isEasnerClientTransactionIdFormat } from "@/lib/transaction-id"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { requestBusinessAccountsRefresh } from "@/lib/cache"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { refetchBusinessMoneyQueries } from "@/lib/query/refresh-after-money-move"
import { useScope } from "@/lib/query/scope"
import { type SendFlowState, SEND_FLOW_STATE_KEY } from "@/lib/send-flow-session"
import {
  isPayoutQuoteFresh,
  payoutQuoteReviewYouSendAmount,
} from "@/lib/noah/map-payout-quote-to-flow"
import {
  isWalletQuoteFresh,
} from "@/lib/wallet-send/map-wallet-quote-to-flow"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"
import { residenceCountryFromPayInCurrency } from "@/hooks/use-yc-cross-border-flow"
import {
  crossBorderQuoteToFlowState,
  ensureCrossBorderOrderConfirmed,
  isCompleteCrossBorderQuote,
  isStashedCrossBorderQuoteFresh,
  isUsableCrossBorderQuotePreview,
  peekCrossBorderLeg2DraftId,
  peekCrossBorderQuote,
  peekLastCrossBorderQuoteError,
  prefetchCrossBorderQuotePipeline,
  type CrossBorderQuoteStashMeta,
} from "@/lib/yc-cross-border-quote-cache"
import {
  ensureGridLivePayoutQuote,
  ensurePayoutOrderConfirmed,
  isCompletePayoutQuoteLocked,
  isStashedPayoutQuoteFresh,
  payoutQuoteToFlowState,
  peekLastPayoutQuoteError,
  peekPayoutQuote,
  type PayoutQuoteStashMeta,
} from "@/lib/payout-quote-cache"
import {
  ensureWalletSendOrderConfirmed,
  walletQuoteToFlowState,
  peekLastWalletQuoteError,
  type WalletQuoteStashMeta,
} from "@/lib/wallet-send-quote-cache"
import { ArrowLeft, Loader2 } from "lucide-react"

const SEND_FLOW_STATE_KEY_LOCAL = SEND_FLOW_STATE_KEY

function hasPayoutReviewSnapshot(pq: SendFlowState["payoutQuote"] | undefined): boolean {
  if (!pq) return false
  return (pq.totalDebited ?? 0) > 0 || (pq.sendAmount ?? 0) > 0
}

function hasWalletReviewSnapshot(wq: SendFlowState["walletQuote"] | undefined): boolean {
  if (!wq) return false
  return (wq.totalDebited ?? 0) > 0 || (wq.sendAmount ?? 0) > 0
}

function isYcCrossBorderFlow(state: SendFlowState | null): boolean {
  return (
    state?.paymentMethod === "otherCurrency" &&
    Boolean(state.otherCurrency) &&
    Boolean(state.otherPaymentMethod)
  )
}

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

function readSendFlowStateFromSession(): SendFlowState | null {
  if (typeof window === "undefined") return null
  const raw = sessionStorage.getItem(SEND_FLOW_STATE_KEY_LOCAL)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SendFlowState
    return {
      ...parsed,
      recipient: coerceBeneficiaryEasenetDisplay(parsed.recipient),
    }
  } catch {
    return null
  }
}

export default function SendConfirmPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { scope } = useScope()
  const { user } = useAuth()
  const { tier1Complete, isLoading: profileLoading, businessId } = useBusinessProfile()
  const { accountRows: sourceAccounts } = useBusinessAccountRows()
  const [state, setState] = useState<SendFlowState | null>(() => readSendFlowStateFromSession())
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [authorizeError, setAuthorizeError] = useState<string | null>(null)
  const [payoutQuoteError, setPayoutQuoteError] = useState<string | null>(null)
  const [payoutQuoteLoading, setPayoutQuoteLoading] = useState(false)
  const [walletQuoteError, setWalletQuoteError] = useState<string | null>(null)
  const [walletQuoteLoading, setWalletQuoteLoading] = useState(false)
  const [ycQuoteError, setYcQuoteError] = useState<string | null>(null)
  const [ycQuoteLoading, setYcQuoteLoading] = useState(false)
  const displayIdFallbackRef = useRef<string | null>(null)

  const isYcCrossBorder = isYcCrossBorderFlow(state)
  const isYcMomo =
    isYcCrossBorder && state?.otherPaymentMethod === "mobile_money"

  const displayTransactionId = useMemo(() => {
    if (isYcCrossBorder) {
      const etid = state?.ycCrossBorder?.easnerTransactionId?.trim()
      if (etid) return etid.toUpperCase()
      const tid = state?.ycCrossBorder?.transactionId?.trim()
      if (tid) return tid.toUpperCase()
    }
    const s = state?.transactionId?.trim()
    if (s) return s.toUpperCase()
    if (!displayIdFallbackRef.current) displayIdFallbackRef.current = generateTransactionId()
    return displayIdFallbackRef.current
  }, [
    isYcCrossBorder,
    state?.transactionId,
    state?.ycCrossBorder?.easnerTransactionId,
    state?.ycCrossBorder?.transactionId,
  ])

  const payoutRail =
    state
      ? resolveRecipientPayoutRail({
          bankName: state.recipient.bankName,
          mobileProvider: state.recipient.mobileProvider,
        })
      : "bank_transfer"
  const { hints: payoutHints } = usePayoutFormSchema({
    countryCode: state?.recipient.countryCode,
    currencyCode: state?.receiveCurrency,
    rail: payoutRail,
  })
  const payoutCountryCode = state
    ? resolvePayoutCountryCode({
        countryCode: state.recipient.countryCode,
        currencyCode: state.receiveCurrency,
      })
    : ""
  const arrivalHint = state
    ? resolveSendConfirmArrivalHint({
        isEasetag: isEasenetRecipient(state.recipient),
        isWalletSend: isWalletRecipient(state.recipient),
        processingSeconds: payoutHints?.processing_seconds,
        countryCode: payoutCountryCode,
        currencyCode: state.receiveCurrency,
        rail: payoutRail,
      })
    : null

  const needPinChallenge =
    !isYcCrossBorder &&
    !!user?.id &&
    isLoginPinModuleAvailable() &&
    hasPin(user.id)

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
        if (parsed.paymentMethod === "otherCurrency" && parsed.otherCurrency) {
          const requestedReceiveAmount =
            parsed.requestedReceiveAmount ??
            parsed.ycCrossBorder?.requestedReceiveAmount ??
            parsed.amount
          setState({
            ...parsed,
            requestedReceiveAmount,
            amount: requestedReceiveAmount,
            recipient: coerceBeneficiaryEasenetDisplay(parsed.recipient),
          })
          return
        }
        if (parsed.paymentMethod && parsed.paymentMethod !== "balance") {
          router.replace("/send")
          return
        }
        if (!parsed.sourceAccountId) {
          router.replace("/send")
          return
        }
        let hydrated = {
          ...parsed,
          recipient: coerceBeneficiaryEasenetDisplay(parsed.recipient),
        }
        const persistedRequestedReceiveAmount =
          parsed.requestedReceiveAmount ??
          parsed.payoutQuote?.requestedReceiveAmount ??
          parsed.ycCrossBorder?.requestedReceiveAmount
        if (
          persistedRequestedReceiveAmount != null &&
          Number.isFinite(persistedRequestedReceiveAmount) &&
          persistedRequestedReceiveAmount > 0
        ) {
          hydrated = {
            ...hydrated,
            requestedReceiveAmount: persistedRequestedReceiveAmount,
            amount: persistedRequestedReceiveAmount,
          }
          sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(hydrated))
        }
        if (
          !isEasenetRecipient(hydrated.recipient) &&
          !isWalletRecipient(hydrated.recipient) &&
          hydrated.amount > 0
        ) {
          const payoutMeta: PayoutQuoteStashMeta = {
            recipientId: hydrated.recipient.id,
            amountEntryMode: hydrated.amountEntryMode ?? "receive",
            entryAmount:
              hydrated.amountEntryMode === "send" && hydrated.sendAmount > 0
                ? hydrated.sendAmount
                : hydrated.amount,
            receiveCurrency: hydrated.receiveCurrency,
            sourceBalanceCurrency: hydrated.sendCurrency,
            ...(hydrated.note ? { note: hydrated.note } : {}),
            ...(hydrated.paymentPurpose ? { paymentPurpose: hydrated.paymentPurpose } : {}),
          }
          if (isStashedPayoutQuoteFresh(payoutMeta)) {
            const locked = peekPayoutQuote()
            if (locked) hydrated = payoutQuoteToFlowState(hydrated, locked)
          }
        }
        setState(hydrated)
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
    if (!state || !isYcMomo) return
    if (state.ycMomoSetup?.sourcePhone && state.ycMomoSetup.networkId) return
    router.replace("/send/momo-setup")
  }, [state, isYcMomo, router])

  useEffect(() => {
    if (!state || isEasenetRecipient(state.recipient)) return
    if (!isDraftRecipientId(state.recipient.id) || !state.draftRecipientPersist) return
    let cancelled = false
    void (async () => {
      try {
        const resolved = await resolveDraftRecipient(state.recipient, state.draftRecipientPersist)
        if (cancelled) return
        const next: SendFlowState = {
          ...state,
          recipient: coerceBeneficiaryEasenetDisplay(resolved),
          draftRecipientPersist: undefined,
        }
        setState(next)
        sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
      } catch (e) {
        if (!cancelled) {
          setAuthorizeError(e instanceof Error ? e.message : "Could not save recipient")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state?.recipient.id, state?.draftRecipientPersist])

  const crossBorderMeta = useMemo((): CrossBorderQuoteStashMeta | null => {
    if (!state || !isYcCrossBorderFlow(state) || !(state.amount > 0)) return null
    const payInCurrency = state.otherCurrency!.toUpperCase()
    const payInCountry = residenceCountryFromPayInCurrency(payInCurrency)
    if (!payInCountry) return null
    const payInRail =
      state.otherPaymentMethod === "mobile_money" ? "mobile_money" : "bank_transfer"
    if (payInRail === "mobile_money") {
      const setup = state.ycMomoSetup
      if (!setup?.sourcePhone || !setup.networkId) return null
      return {
        recipientId: state.recipient.id,
        payInCurrency,
        payInCountry,
        payInRail,
        receiveAmount: state.amount,
        crossBorderProvider:
          state.crossBorderProvider ??
          (peekCrossBorderQuote()?.provider === "grid" ? "grid" : undefined) ??
          "yellowcard",
        sourcePhone: setup.sourcePhone,
        networkId: setup.networkId,
        sourceNetworkName: setup.sourceNetworkName,
      }
    }
    return {
      recipientId: state.recipient.id,
      payInCurrency,
      payInCountry,
      payInRail,
      receiveAmount:
        state.requestedReceiveAmount ??
        state.ycCrossBorder?.requestedReceiveAmount ??
        state.amount,
      crossBorderProvider:
        state.crossBorderProvider ??
        (peekCrossBorderQuote()?.provider === "grid" ? "grid" : undefined) ??
        "yellowcard",
    }
  }, [state])

  /**
   * Cross-border review shows preview rates immediately. POST /receive (full lock)
   * runs on Pay via YcPayInReviewSection — do not auto-confirm on mount.
   */
  useEffect(() => {
    if (!state || !crossBorderMeta || isDraftRecipientId(state.recipient.id)) return
    if (
      state.ycCrossBorder?.transferId &&
      state.ycCrossBorder.localPayIn > 0 &&
      state.ycCrossBorder.customerRate > 0
    ) {
      return
    }

    if (isStashedCrossBorderQuoteFresh(crossBorderMeta)) {
      const stashed = peekCrossBorderQuote()
      if (stashed && isUsableCrossBorderQuotePreview(stashed)) {
        const yc = crossBorderQuoteToFlowState(stashed, crossBorderMeta)
        const next: SendFlowState = {
          ...state,
          sendAmount: yc.localPayIn,
          sendCurrency: crossBorderMeta.payInCurrency,
          totalAmount: yc.localPayIn,
          transactionId: yc.easnerTransactionId || yc.transactionId || state.transactionId,
          ycCrossBorder: yc,
        }
        setState(next)
        sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
      }
    }

    // Keep leg2 warm in background; Pay still awaits confirm.
    prefetchCrossBorderQuotePipeline(crossBorderMeta)
    setYcQuoteLoading(false)
  }, [
    crossBorderMeta,
    state?.ycCrossBorder?.transferId,
    state?.ycCrossBorder?.localPayIn,
    state?.ycCrossBorder?.customerRate,
  ])

  useEffect(() => {
    if (
      !state ||
      isYcCrossBorderFlow(state) ||
      isEasenetRecipient(state.recipient) ||
      isWalletRecipient(state.recipient) ||
      isDraftRecipientId(state.recipient.id) ||
      !(state.amount > 0)
    )
      return
    const requestedReceiveAmount =
      state.requestedReceiveAmount ?? state.payoutQuote?.requestedReceiveAmount ?? state.amount
    if (isPayoutQuoteFresh(state.payoutQuote, requestedReceiveAmount, state.recipient.id)) return

    const meta: PayoutQuoteStashMeta = {
      recipientId: state.recipient.id,
      amountEntryMode: state.amountEntryMode ?? "receive",
      entryAmount:
        state.amountEntryMode === "send" && state.sendAmount > 0
          ? state.sendAmount
          : requestedReceiveAmount,
      receiveCurrency: state.receiveCurrency,
      sourceBalanceCurrency: state.sendCurrency,
      ...(state.note ? { note: state.note } : {}),
      ...(state.paymentPurpose ? { paymentPurpose: state.paymentPurpose } : {}),
    }

    if (isStashedPayoutQuoteFresh(meta)) {
      const stashed = peekPayoutQuote()
      if (stashed) {
        const next = payoutQuoteToFlowState(state, stashed)
        if (isPayoutQuoteFresh(next.payoutQuote, requestedReceiveAmount, state.recipient.id)) {
          setState(next)
          sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
          return
        }
      }
    }

    let cancelled = false
    setPayoutQuoteError(null)
    setPayoutQuoteLoading(true)
    void (async () => {
      try {
        const quote = await ensurePayoutOrderConfirmed(meta, businessId)
        if (cancelled) return
        if (!isCompletePayoutQuoteLocked(quote)) {
          setPayoutQuoteError(peekLastPayoutQuoteError() || "Could not lock payout order")
          return
        }
        const next = payoutQuoteToFlowState(state, quote)
        setState(next)
        sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
      } finally {
        if (!cancelled) setPayoutQuoteLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    state?.recipient.id,
    state?.amount,
    state?.requestedReceiveAmount,
    state?.sendAmount,
    state?.amountEntryMode,
    state?.sendCurrency,
    state?.receiveCurrency,
    state?.note,
    state?.paymentPurpose,
    state?.payoutQuote?.lockId,
    state?.payoutQuote?.quotePhase,
    businessId,
  ])

  useEffect(() => {
    if (
      !state ||
      isYcCrossBorderFlow(state) ||
      isEasenetRecipient(state.recipient) ||
      !isWalletRecipient(state.recipient) ||
      isDraftRecipientId(state.recipient.id) ||
      !(state.amount > 0)
    )
      return
    if (isWalletQuoteFresh(state.walletQuote, state.amount, state.recipient.id)) return

    const meta: WalletQuoteStashMeta = {
      recipientId: state.recipient.id,
      amountEntryMode: state.amountEntryMode ?? "receive",
      entryAmount:
        state.amountEntryMode === "send" && state.sendAmount > 0
          ? state.sendAmount
          : state.amount,
      receiveCurrency: state.receiveCurrency,
      sourceBalanceCurrency: state.sendCurrency,
    }

    let cancelled = false
    setWalletQuoteError(null)
    setWalletQuoteLoading(true)
    void (async () => {
      try {
        const quote = await ensureWalletSendOrderConfirmed(meta, businessId)
        if (cancelled) return
        if (!quote?.formSessionId) {
          setWalletQuoteError(peekLastWalletQuoteError() || "Could not lock wallet send order")
          return
        }
        const next = walletQuoteToFlowState(state, quote)
        setState(next)
        sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
      } finally {
        if (!cancelled) setWalletQuoteLoading(false)
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
    state?.receiveCurrency,
    state?.walletQuote?.quotePhase,
    businessId,
  ])

  const quoteCountdown = useQuoteCountdown(
    state?.ycCrossBorder?.expiresAt ?? state?.walletQuote?.expiresAt ?? state?.payoutQuote?.expiresAt,
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

    let flowRecipient = state.recipient
    if (isDraftRecipientId(flowRecipient.id) && state.draftRecipientPersist) {
      try {
        flowRecipient = await resolveDraftRecipient(flowRecipient, state.draftRecipientPersist)
        setState({
          ...state,
          recipient: flowRecipient,
          draftRecipientPersist: undefined,
        })
      } catch (e) {
        setAuthorizeError(e instanceof Error ? e.message : "Could not save recipient")
        return
      }
    }

    if (isEasenetRecipient(flowRecipient)) {
      setIsAuthorizing(true)
      try {
        const tag = flowRecipient.payeeEasetag!.trim().replace(/^@+/, "")
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
          headers["X-Easner-Account-Scope"] = "business"
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
        requestBusinessAccountsRefresh()
        await finishSend(id)
      } catch (e) {
        setAuthorizeError(e instanceof Error ? e.message : "Transfer failed")
      } finally {
        setIsAuthorizing(false)
      }
      return
    }

    if (isWalletRecipient(flowRecipient)) {
      const wq = state.walletQuote
      if (!wq?.formSessionId) {
        setAuthorizeError(walletQuoteError || "Wallet send quote is not ready. Go back and try again.")
        return
      }
      if (wq.recipientId && wq.recipientId !== flowRecipient.id) {
        setAuthorizeError("Wallet quote doesn't match this recipient. Go back and tap Continue again.")
        return
      }

      setIsAuthorizing(true)
      try {
        const scopeHeaders: Record<string, string> = {}
        if (businessId) scopeHeaders["X-Easner-Account-Scope"] = "business"

        const walletEtid =
          typeof state.transactionId === "string" &&
          isEasnerClientTransactionIdFormat(state.transactionId)
            ? state.transactionId.trim().toUpperCase()
            : ""

        const receiveNetwork = flowRecipient.walletNetwork?.trim() || wq.receiveNetwork
        const reviewSnapshot = {
          you_send_amount: wq.sendAmount,
          total_debited: wq.totalDebited,
          exchange_fee: wq.displayChannelCost ?? wq.channelCost,
          processing_fee: wq.processingFee ?? wq.marginAmount,
          network_fee: wq.networkFee,
          exchange_rate:
            wq.executionModel === "direct_turnkey" ? 1 : wq.customerRate,
          execution_model: wq.executionModel,
          send_currency: state.sendCurrency,
          receive_amount: state.amount,
          receive_currency: state.receiveCurrency,
          transfer_method: formatWalletSendTransferMethod(state.receiveCurrency, receiveNetwork),
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
            recipientId: flowRecipient.id,
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
    if (pq.recipientId && pq.recipientId !== flowRecipient.id) {
      setAuthorizeError("Payout quote doesn't match this recipient. Go back and tap Continue again.")
      return
    }

    setIsAuthorizing(true)
    try {
      const scopeHeaders: Record<string, string> = {}
      if (businessId) scopeHeaders["X-Easner-Account-Scope"] = "business"

      const payoutEtid =
        typeof state.transactionId === "string" &&
        isEasnerClientTransactionIdFormat(state.transactionId)
          ? state.transactionId.trim().toUpperCase()
          : ""

      let pqLive = pq
      let gridQuoteId = pq.gridQuoteId
      let gridFundingAddress = pq.gridFundingAddress
      let gridCryptoAmount = pq.gridCryptoAmount
      let gridCustomerId = pq.gridCustomerId
      let gridExternalAccountId = pq.gridExternalAccountId
      if (pq.provider === "grid" && pq.lockId) {
        const live = await ensureGridLivePayoutQuote(pq.lockId, businessId)
        if (!live?.grid?.quoteId) {
          throw new Error("Could not lock payout order. Try again.")
        }
        pqLive = payoutQuoteToFlowState(state, live).payoutQuote ?? pq
        gridQuoteId = live.grid.quoteId
        gridFundingAddress = live.grid.fundingAddress
        gridCryptoAmount = live.grid.cryptoAmount
        gridCustomerId = live.grid.customerId
        gridExternalAccountId = live.grid.externalAccountId
      }

      const transferMethod = corridorTransferMethod(flowRecipient, state.receiveCurrency)
      const processingTime = arrivalHint ?? undefined
      const reviewProcessingFee = pqLive.processingFee ?? pqLive.easnerFee ?? 0
      const reviewDisplayChannel =
        pqLive.provider === "grid"
          ? Math.max(
              0,
              Math.round((pqLive.totalDebited - reviewYouSend - reviewProcessingFee) * 1_000_000) /
                1_000_000,
            )
          : (pqLive.displayChannelCost ?? pqLive.channelCost ?? 0)
      const reviewChannelCost = pqLive.channelCost ?? 0
      const reviewMargin = pqLive.marginAmount ?? 0
      const reviewSnapshot = {
        you_send_amount: reviewYouSend,
        total_debited: pqLive.totalDebited,
        exchange_fee: reviewDisplayChannel,
        processing_fee: reviewProcessingFee,
        exchange_rate: reviewExchangeRate,
        send_currency: state.sendCurrency,
        receive_amount: state.amount,
        receive_currency: state.receiveCurrency,
        transfer_method: transferMethod,
        processing_time: processingTime,
        ...(reviewProcessingFee > 0 ? { easner_fee: reviewProcessingFee } : {}),
        ...(reviewMargin > 0 ? { margin_amount: reviewMargin } : {}),
        ...(reviewChannelCost > 0 ? { channel_cost: reviewChannelCost } : {}),
        ...(pqLive.scheduleFee != null ? { noah_schedule_fee: pqLive.scheduleFee } : {}),
        ...(pqLive.prepareChannelFee != null ? { noah_channel_fee: pqLive.prepareChannelFee } : {}),
        ...(pqLive.quoteNoahMid != null ? { quote_noah_mid: pqLive.quoteNoahMid } : {}),
        ...(pqLive.provider === "grid"
          ? { noah_floor: reviewYouSend, noah_send_amount: reviewYouSend }
          : {
              ...(pqLive.noahFloor ? { noah_floor: Number(pqLive.noahFloor) } : {}),
              ...(pqLive.noahSendAmount ? { noah_send_amount: Number(pqLive.noahSendAmount) } : {}),
            }),
      }

      const transferBody = {
        amount: state.amount.toFixed(2),
        currency: state.receiveCurrency.toLowerCase(),
        formSessionId: pqLive.formSessionId,
        cryptoAuthorizedAmount:
          pqLive.provider === "grid" && gridCryptoAmount != null
            ? String(gridCryptoAmount)
            : pqLive.cryptoAuthorizedAmount,
        cryptoCurrency: pqLive.cryptoCurrency,
        countryCode: flowRecipient.countryCode?.toUpperCase(),
        ...(pqLive.channelId ? { channelId: pqLive.channelId } : {}),
        recipientId: flowRecipient.id,
        ...(payoutEtid ? { reservedDebitEtid: payoutEtid } : {}),
        ...(state.note ? { note: state.note } : {}),
        ...(state.paymentPurpose ? { paymentPurpose: state.paymentPurpose } : {}),
        ...(pqLive.noahFloor ? { noahFloor: pqLive.noahFloor } : {}),
        ...(pqLive.noahSendAmount ? { noahSendAmount: pqLive.noahSendAmount } : {}),
        totalDebited: String(pqLive.totalDebited),
        ...(pqLive.marginAmount != null ? { marginAmount: String(pqLive.marginAmount) } : {}),
        ...(pqLive.marginCaptureMode ? { marginCaptureMode: pqLive.marginCaptureMode } : {}),
        ...(pqLive.midRate != null ? { customerRate: pqLive.midRate } : {}),
        ...(pqLive.noahMid != null ? { noahMid: pqLive.noahMid } : {}),
        ...(pqLive.processingFee != null ? { processingFee: String(pqLive.processingFee) } : {}),
        ...(pqLive.channelCost != null ? { channelCost: String(pqLive.channelCost) } : {}),
        ...(pqLive.customerPrincipal != null ? { customerPrincipal: String(pqLive.customerPrincipal) } : {}),
        ...(pqLive.provider ? { payoutProvider: pqLive.provider } : {}),
        ...(pqLive.ycSequenceId ? { ycSequenceId: pqLive.ycSequenceId } : {}),
        ...(pqLive.ycSendId ? { ycSendId: pqLive.ycSendId } : {}),
        ...(pqLive.ycWalletAddress ? { ycWalletAddress: pqLive.ycWalletAddress } : {}),
        ...(pqLive.ycCryptoAmount != null ? { ycCryptoAmount: pqLive.ycCryptoAmount } : {}),
        ...(pqLive.lockId ? { lockId: pqLive.lockId } : {}),
        ...(pqLive.provider === "grid" && gridQuoteId ? { gridQuoteId } : {}),
        ...(pqLive.provider === "grid" && gridFundingAddress ? { gridFundingAddress } : {}),
        ...(pqLive.provider === "grid" && gridCryptoAmount != null ? { gridCryptoAmount } : {}),
        ...(pqLive.provider === "grid" && gridCustomerId ? { gridCustomerId } : {}),
        ...(pqLive.provider === "grid" && gridExternalAccountId ? { gridExternalAccountId } : {}),
        reviewSnapshot,
      }

      const transferRes = await fetchWithSession("/api/transfers", {
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
  const walletNetwork =
    state.recipient.walletNetwork?.trim() || state.walletQuote?.receiveNetwork?.trim() || ""
  const hasFx = easenetSend
    ? false
    : walletSend
      ? hasWalletSendFxDisplay(state.sendCurrency, state.receiveCurrency, walletNetwork)
      : state.receiveCurrency.toUpperCase() !== state.sendCurrency.toUpperCase()
  const pq = state.payoutQuote
  const wq = state.walletQuote
  const yc = state.ycCrossBorder
  const requestedReceiveAmount =
    state.requestedReceiveAmount ??
    pq?.requestedReceiveAmount ??
    yc?.requestedReceiveAmount ??
    state.amount
  const ycQuoteFullyLocked = Boolean(
    yc?.transferId && yc.localPayIn > 0 && yc.customerRate > 0,
  )
  const ycPreviewReady = Boolean(yc?.localPayIn && yc.localPayIn > 0 && yc.customerRate > 0)
  const ycLeg2Ready = Boolean(
    ycPreviewReady && (ycQuoteFullyLocked || Boolean(peekCrossBorderLeg2DraftId())),
  )
  const ycQuoteLocked = ycLeg2Ready || ycPreviewReady
  const quoteReady = isYcCrossBorder
    ? ycPreviewReady
    : easenetSend ||
      (walletSend
        ? isWalletQuoteFresh(wq, state.amount, state.recipient.id)
        : isPayoutQuoteFresh(pq, requestedReceiveAmount, state.recipient.id))
  const easnerFee = isYcCrossBorder
    ? (yc?.processingFee ?? 0)
    : walletSend
      ? (wq?.processingFee ?? wq?.marginAmount ?? 0)
      : (pq?.processingFee ?? pq?.easnerFee ?? 0)
  const easnerFeeCurrency = isYcCrossBorder
    ? state.sendCurrency
    : walletSend
      ? state.sendCurrency
      : (pq?.easnerFeeCurrency ?? state.sendCurrency)
  const youSendAmount = isYcCrossBorder
    ? (yc?.localPayIn ?? state.sendAmount)
    : walletSend
      ? (wq?.sendAmount ?? state.sendAmount)
      : (payoutQuoteReviewYouSendAmount(pq, state.sendAmount) || state.sendAmount)
  const exchangeRate = isYcCrossBorder
    ? (yc?.customerRate ?? 1)
    : hasFx && (walletSend ? wq?.customerRate : pq?.midRate) &&
        (walletSend ? wq!.customerRate : pq!.midRate!) > 0
      ? walletSend
        ? wq!.customerRate
        : pq!.midRate!
      : 1
  const exchangeFee = isYcCrossBorder ? 0 : walletSend
    ? (wq?.displayChannelCost ?? wq?.channelCost ?? 0)
    : pq?.provider === "grid"
      ? Math.max(
          0,
          Math.round(
            ((pq.totalDebited ?? 0) - youSendAmount - (pq.processingFee ?? pq.easnerFee ?? 0)) *
              1_000_000,
          ) / 1_000_000,
        )
      : (pq?.displayChannelCost ?? 0)
  const networkFee = walletSend ? (wq?.networkFee ?? 0) : 0
  const totalDebited = isYcCrossBorder
    ? (yc?.localPayIn ?? state.sendAmount)
    : walletSend
      ? (wq?.totalDebited ?? state.sendAmount)
      : (pq?.totalDebited ?? state.sendAmount)
  const walletTransferMethod = walletSend
    ? `${state.receiveCurrency} on ${state.recipient.walletNetwork?.trim() || wq?.receiveNetwork || "wallet"}`
    : transferMethod
  const authorizeDisabled = isYcCrossBorder
    ? isYcMomo
      ? isAuthorizing ||
        (ycQuoteLoading && !ycQuoteLocked) ||
        Boolean(ycQuoteError) ||
        !quoteReady ||
        quoteCountdown.expired
      : isAuthorizing ||
        (ycQuoteLoading && !ycQuoteLocked) ||
        Boolean(ycQuoteError) ||
        !quoteReady ||
        quoteCountdown.expired
    : isAuthorizing ||
      Boolean((walletSend ? walletQuoteError : payoutQuoteError) && !easenetSend) ||
      (!easenetSend && (!quoteReady || quoteCountdown.expired))

  const crossBorderLockKey = crossBorderMeta
    ? [
        crossBorderMeta.recipientId,
        crossBorderMeta.payInCurrency,
        crossBorderMeta.payInCountry,
        crossBorderMeta.payInRail,
        crossBorderMeta.receiveAmount,
        crossBorderMeta.sourcePhone ?? "",
        crossBorderMeta.networkId ?? "",
      ].join("|")
    : ""

  const stashedCrossBorder =
    crossBorderMeta && isStashedCrossBorderQuoteFresh(crossBorderMeta)
      ? peekCrossBorderQuote()
      : null

  const ycCrossBorderReviewReady = Boolean(
    (yc?.localPayIn && yc.localPayIn > 0 && yc.customerRate > 0) ||
      (stashedCrossBorder && isUsableCrossBorderQuotePreview(stashedCrossBorder)),
  )

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">
          {isYcCrossBorder ? YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE : "Review transfer"}
        </h1>
      </div>

      {isYcCrossBorder && crossBorderMeta && ycCrossBorderReviewReady ? (
        <YcPayInReviewSection
          flowMode="cross_border_send"
          lockKey={crossBorderLockKey}
          getCachedLocked={() => {
            if (yc?.transferId && yc.localPayIn > 0 && yc.customerRate > 0) {
              return {
                ok: true as const,
                transferId: yc.transferId,
                transactionId: yc.transactionId,
                easnerTransactionId: yc.easnerTransactionId,
                localPayIn: yc.localPayIn,
                customerRate: yc.customerRate,
                processingFee: yc.processingFee,
                ycLegFeesUsd: yc.ycLegFeesUsd,
                displayProcessingFeeLocal: yc.displayProcessingFeeLocal,
                provisionalPayIn: yc.provisionalPayIn,
                receiveAmount: yc.receiveAmount,
                requestedReceiveAmount: yc.requestedReceiveAmount,
                bankInfo: yc.bankInfo,
                expiresAt: yc.expiresAt,
                sourcePhone: yc.sourcePhone,
                sourceNetworkName: yc.sourceNetworkName,
              }
            }
            if (
              crossBorderMeta &&
              isStashedCrossBorderQuoteFresh(crossBorderMeta)
            ) {
              const cached = peekCrossBorderQuote()
              if (cached && isCompleteCrossBorderQuote(cached)) {
                return {
                  ok: true as const,
                  transferId: cached.transferId ?? null,
                  transactionId: cached.transactionId,
                  easnerTransactionId: cached.easnerTransactionId,
                  localPayIn: cached.localPayIn,
                  customerRate: cached.customerRate,
                  processingFee: cached.processingFee,
                  ycLegFeesUsd: cached.ycLegFeesUsd,
                  displayProcessingFeeLocal: cached.displayProcessingFeeLocal,
                  provisionalPayIn: cached.provisionalPayIn,
                  receiveAmount: cached.receiveAmount,
                  requestedReceiveAmount: cached.requestedReceiveAmount,
                  bankInfo: cached.bankInfo,
                  expiresAt: cached.expiresAt,
                  sourcePhone: cached.sourcePhone,
                  sourceNetworkName: cached.sourceNetworkName,
                }
              }
            }
            if (!yc?.transferId || !(yc.localPayIn > 0) || !(yc.customerRate > 0)) return null
            return {
              ok: true as const,
              transferId: yc.transferId,
              transactionId: yc.transactionId,
              easnerTransactionId: yc.easnerTransactionId,
              localPayIn: yc.localPayIn,
              customerRate: yc.customerRate,
              processingFee: yc.processingFee,
              ycLegFeesUsd: yc.ycLegFeesUsd,
              displayProcessingFeeLocal: yc.displayProcessingFeeLocal,
              provisionalPayIn: yc.provisionalPayIn,
              receiveAmount: yc.receiveAmount,
              requestedReceiveAmount: yc.requestedReceiveAmount,
              bankInfo: yc.bankInfo,
              expiresAt: yc.expiresAt,
              sourcePhone: yc.sourcePhone,
              sourceNetworkName: yc.sourceNetworkName,
            }
          }}
          confirmOrder={async () => {
            const quote = await ensureCrossBorderOrderConfirmed(crossBorderMeta)
            if (!quote?.transferId || !isCompleteCrossBorderQuote(quote)) return null
            const ycNext = crossBorderQuoteToFlowState(quote, crossBorderMeta)
            const next: SendFlowState = {
              ...state,
              sendAmount: ycNext.localPayIn,
              sendCurrency: crossBorderMeta.payInCurrency,
              totalAmount: ycNext.localPayIn,
              transactionId: ycNext.easnerTransactionId || ycNext.transactionId || state.transactionId,
              ycCrossBorder: ycNext,
            }
            setState(next)
            sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
            return {
              ok: true as const,
              transferId: quote.transferId ?? null,
              transactionId: quote.transactionId,
              easnerTransactionId: quote.easnerTransactionId,
              localPayIn: quote.localPayIn,
              customerRate: quote.customerRate,
              processingFee: quote.processingFee,
              ycLegFeesUsd: quote.ycLegFeesUsd,
              displayProcessingFeeLocal: quote.displayProcessingFeeLocal,
              provisionalPayIn: quote.provisionalPayIn,
              receiveAmount: quote.receiveAmount,
              requestedReceiveAmount: quote.requestedReceiveAmount,
              bankInfo: quote.bankInfo,
              expiresAt: quote.expiresAt,
              sourcePhone: quote.sourcePhone,
              sourceNetworkName: quote.sourceNetworkName,
            }
          }}
          getErrorMessage={() => peekLastCrossBorderQuoteError() ?? ycQuoteError}
          crossBorderMeta={crossBorderMeta}
          clientCustomerRate={yc?.customerRate ?? stashedCrossBorder?.customerRate}
          clientProvisionalLocalPayIn={
            yc?.localPayIn ?? yc?.provisionalPayIn ?? stashedCrossBorder?.localPayIn
          }
          clientProcessingFee={yc?.processingFee ?? stashedCrossBorder?.processingFee}
          clientDisplayProcessingFeeLocal={
            yc?.displayProcessingFeeLocal ?? stashedCrossBorder?.displayProcessingFeeLocal
          }
          clientYcLegFeesUsd={yc?.ycLegFeesUsd ?? stashedCrossBorder?.ycLegFeesUsd}
          payInCurrency={state.sendCurrency}
          receiveCurrency={state.receiveCurrency}
          receiveAmount={yc?.requestedReceiveAmount ?? state.amount}
          payInRail={
            state.otherPaymentMethod === "mobile_money" ? "mobile_money" : "bank_transfer"
          }
          recipientNode={
            <SendSelectedRecipientSummary
              beneficiary={state.recipient}
              alignEnd
              className="min-w-0 max-w-[70%] shrink-0"
            />
          }
          copiedField={copiedKey}
          onCopy={handleCopy}
          attest={{
            onAttest: async ({ transactionId, transferId }) => {
              const provider =
                state.crossBorderProvider === "grid" ? ("grid" as const) : ("yellowcard" as const)
              const result = await attestPayInPayment({
                provider,
                transactionId,
                transferId,
                fetch: async (url, init) => {
                  const res = await fetchWithSession(url, init)
                  return {
                    ok: res.ok,
                    status: res.status,
                    json: () => res.json(),
                  }
                },
              })
              return { attestedAt: result.attestedAt }
            },
            onSuccess: (transactionId) => finishSend(transactionId),
          }}
        />
      ) : isYcCrossBorder ? (
        ycQuoteLoading && !ycQuoteError ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : ycQuoteError ? (
          <p className="text-sm text-destructive">{ycQuoteError}</p>
        ) : null
      ) : (
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
            receive_amount: pq?.receiveAmount ?? requestedReceiveAmount,
            requested_receive_amount: requestedReceiveAmount,
            receive_currency: state.receiveCurrency,
            transfer_method: walletTransferMethod,
            processing_time: arrivalHint ?? "",
            ...(walletSend && wq?.executionModel
              ? { execution_model: wq.executionModel }
              : {}),
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
          showFeeBreakdown={
            !easenetSend &&
            (quoteReady ||
              hasPayoutReviewSnapshot(pq) ||
              hasWalletReviewSnapshot(wq) ||
              shouldShowPayoutReviewFeeRow({
                processingFee: easnerFee,
                exchangeFee,
              }))
          }
          globalFiatPayout={!walletSend && !easenetSend}
          receiveNetwork={walletSend ? walletNetwork : undefined}
          walletSendExecutionModel={walletSend ? wq?.executionModel : undefined}
          mode="confirm"
          reviewFlow="balance_payout"
        />
      )}

      {!isYcCrossBorder && (walletSend ? walletQuoteError : payoutQuoteError) &&
      !easenetSend ? (
        <p className="text-sm text-destructive">
          {isYcCrossBorder ? ycQuoteError : walletSend ? walletQuoteError : payoutQuoteError}
        </p>
      ) : null}
      {!easenetSend && !isYcCrossBorder && (wq?.expiresAt || pq?.expiresAt) ? (
        <div className="text-xs text-muted-foreground">
          {quoteCountdown.expired
            ? "Quote expired — go back and continue again for a fresh quote."
            : `Quote valid for ${quoteCountdown.label}`}
        </div>
      ) : null}
      {!easenetSend &&
      !isYcCrossBorder &&
      !quoteReady &&
      (payoutQuoteLoading || walletQuoteLoading) &&
      !quoteCountdown.expired ? (
        <p className="text-xs text-muted-foreground">Updating quote…</p>
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

      {!isYcCrossBorder ? (
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
          ) : !easenetSend && !quoteReady && (payoutQuoteLoading || walletQuoteLoading) ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating quote…
            </>
          ) : (
            SEND_REVIEW_CONFIRM_CTA
          )}
        </Button>
      </div>
      ) : null}

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
