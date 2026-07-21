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
} from "@easner/shared"
import { usePayoutFormSchema } from "@/lib/use-payout-form-schema"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { SendSelectedRecipientSummary } from "@/components/send/send-selected-recipient-summary"
import { PayoutReviewDetailsRows } from "@/components/transactions/payout-review-details-rows"
import { YcPayInReviewSection } from "@/components/yc/yc-pay-in-review-section"
import { generateTransactionId, isEasnerClientTransactionIdFormat } from "@/lib/transaction-id"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { dataCache, CACHE_KEYS, requestBusinessAccountsRefresh } from "@/lib/cache"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { refetchBusinessMoneyQueries } from "@/lib/query/refresh-after-money-move"
import { useScope } from "@/lib/query/scope"
import { type SendFlowState, SEND_FLOW_STATE_KEY } from "@/lib/send-flow-session"
import {
  isPayoutQuoteFresh,
} from "@/lib/noah/map-payout-quote-to-flow"
import {
  isWalletQuoteFresh,
} from "@/lib/wallet-send/map-wallet-quote-to-flow"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"
import { residenceCountryFromPayInCurrency } from "@/hooks/use-yc-cross-border-flow"
import {
  crossBorderQuoteToFlowState,
  ensureCrossBorderOrderConfirmed,
  fetchCrossBorderQuotePreview,
  isCompleteCrossBorderQuote,
  isStashedCrossBorderQuoteFresh,
  peekCrossBorderQuote,
  peekLastCrossBorderQuoteError,
  type CrossBorderQuoteStashMeta,
} from "@/lib/yc-cross-border-quote-cache"
import {
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
          setState({
            ...parsed,
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
      receiveAmount: state.amount,
    }
  }, [state])

  useEffect(() => {
    if (!state || !crossBorderMeta) return
    if (state.ycCrossBorder?.localPayIn > 0 && state.ycCrossBorder?.customerRate > 0) {
      return
    }

    if (
      isStashedCrossBorderQuoteFresh(crossBorderMeta) &&
      peekCrossBorderQuote()?.localPayIn
    ) {
      const stashed = peekCrossBorderQuote()
      if (stashed) {
        const yc = crossBorderQuoteToFlowState(stashed, crossBorderMeta)
        const next: SendFlowState = {
          ...state,
          sendAmount: yc.localPayIn,
          sendCurrency: crossBorderMeta.payInCurrency,
          totalAmount: yc.localPayIn,
          ycCrossBorder: yc,
        }
        setState(next)
        sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
      }
      return
    }

    let cancelled = false
    setYcQuoteError(null)
    setYcQuoteLoading(true)
    void fetchCrossBorderQuotePreview(crossBorderMeta)
      .then((preview) => {
        if (cancelled || !preview?.ok) return
        const ycPreview = crossBorderQuoteToFlowState(preview, crossBorderMeta)
        const previewState: SendFlowState = {
          ...state,
          sendAmount: ycPreview.localPayIn,
          sendCurrency: crossBorderMeta.payInCurrency,
          totalAmount: ycPreview.localPayIn,
          ycCrossBorder: ycPreview,
        }
        setState(previewState)
        sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(previewState))
      })
      .catch(() => {
        if (!cancelled) {
          setYcQuoteError("Could not load transfer quote")
        }
      })
      .finally(() => {
        if (!cancelled) setYcQuoteLoading(false)
      })

    return () => {
      cancelled = true
      setYcQuoteLoading(false)
    }
  }, [
    crossBorderMeta,
    state?.ycCrossBorder?.localPayIn,
    state?.ycCrossBorder?.customerRate,
  ])

  useEffect(() => {
    if (!state || isYcCrossBorderFlow(state) || isEasenetRecipient(state.recipient) || isWalletRecipient(state.recipient) || !(state.amount > 0))
      return
    if (isPayoutQuoteFresh(state.payoutQuote, state.amount, state.recipient.id)) return

    const meta: PayoutQuoteStashMeta = {
      recipientId: state.recipient.id,
      amountEntryMode: state.amountEntryMode ?? "receive",
      entryAmount:
        state.amountEntryMode === "send" && state.sendAmount > 0
          ? state.sendAmount
          : state.amount,
      receiveCurrency: state.receiveCurrency,
      sourceBalanceCurrency: state.sendCurrency,
      ...(state.note ? { note: state.note } : {}),
      ...(state.paymentPurpose ? { paymentPurpose: state.paymentPurpose } : {}),
    }

    if (isStashedPayoutQuoteFresh(meta)) {
      const stashed = peekPayoutQuote()
      if (stashed) {
        const next = payoutQuoteToFlowState(state, stashed)
        if (isPayoutQuoteFresh(next.payoutQuote, state.amount, state.recipient.id)) {
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
    if (!state || isEasenetRecipient(state.recipient) || !isWalletRecipient(state.recipient) || !(state.amount > 0))
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
      // Display channel component (foots with total); ops channel cost + margin kept separately.
      const reviewDisplayChannel = pq!.displayChannelCost ?? pq!.channelCost ?? 0
      const reviewChannelCost = pq!.channelCost ?? 0
      const reviewMargin = pq!.marginAmount ?? 0
      const reviewProcessingFee = pq!.processingFee ?? pq!.easnerFee ?? 0
      const reviewSnapshot = {
        you_send_amount: reviewYouSend,
        total_debited: pq!.totalDebited,
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
        ...(pq!.scheduleFee != null ? { noah_schedule_fee: pq!.scheduleFee } : {}),
        ...(pq!.prepareChannelFee != null ? { noah_channel_fee: pq!.prepareChannelFee } : {}),
        ...(pq!.quoteNoahMid != null ? { quote_noah_mid: pq!.quoteNoahMid } : {}),
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
        ...(pq.processingFee != null ? { processingFee: String(pq.processingFee) } : {}),
        ...(pq.channelCost != null ? { channelCost: String(pq.channelCost) } : {}),
        ...(pq.customerPrincipal != null ? { customerPrincipal: String(pq.customerPrincipal) } : {}),
        ...(pq.provider ? { payoutProvider: pq.provider } : {}),
        ...(pq.ycSequenceId ? { ycSequenceId: pq.ycSequenceId } : {}),
        ...(pq.ycSendId ? { ycSendId: pq.ycSendId } : {}),
        ...(pq.ycWalletAddress ? { ycWalletAddress: pq.ycWalletAddress } : {}),
        ...(pq.ycCryptoAmount != null ? { ycCryptoAmount: pq.ycCryptoAmount } : {}),
        ...(pq.lockId ? { lockId: pq.lockId } : {}),
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
  const ycQuoteFullyLocked = Boolean(
    yc?.transferId && yc.localPayIn > 0 && yc.customerRate > 0,
  )
  const ycLeg2Ready = Boolean(
    yc?.localPayIn &&
      yc.localPayIn > 0 &&
      yc.customerRate > 0 &&
      (ycQuoteFullyLocked || Boolean(peekCrossBorderLeg2DraftId())),
  )
  const ycQuoteLocked = ycLeg2Ready
  const quoteReady = isYcCrossBorder
    ? ycLeg2Ready
    : easenetSend ||
      (walletSend
        ? isWalletQuoteFresh(wq, state.amount, state.recipient.id) && !walletQuoteLoading
        : isPayoutQuoteFresh(pq, state.amount, state.recipient.id) && !payoutQuoteLoading)
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
      : (pq?.customerPrincipal ?? pq?.sendAmount ?? state.sendAmount)
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">
          {isYcCrossBorder ? YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE : "Review transfer"}
        </h1>
      </div>

      {isYcCrossBorder && crossBorderMeta ? (
        <YcPayInReviewSection
          flowMode="cross_border_send"
          lockKey={crossBorderLockKey}
          getCachedLocked={() => {
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
              bankInfo: quote.bankInfo,
              expiresAt: quote.expiresAt,
              sourcePhone: quote.sourcePhone,
              sourceNetworkName: quote.sourceNetworkName,
            }
          }}
          getErrorMessage={() => peekLastCrossBorderQuoteError() ?? ycQuoteError}
          clientCustomerRate={yc?.customerRate}
          clientProvisionalLocalPayIn={yc?.localPayIn ?? yc?.provisionalPayIn}
          payInCurrency={state.sendCurrency}
          receiveCurrency={state.receiveCurrency}
          receiveAmount={state.amount}
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
            receive_amount: state.amount,
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
          showFeeBreakdown={!easenetSend && quoteReady}
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
