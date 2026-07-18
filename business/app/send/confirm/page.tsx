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
  normalizeYcMomoPhone,
  resolveYcCrossBorderLocalPayInBreakdownForDisplay,
} from "@easner/shared"
import { usePayoutFormSchema } from "@/lib/use-payout-form-schema"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { SendSelectedRecipientSummary } from "@/components/send/send-selected-recipient-summary"
import { PayoutReviewDetailsRows } from "@/components/transactions/payout-review-details-rows"
import { YcLocalPayInReview } from "@/components/yc-local-pay-in-review"
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
import { residenceCountryFromPayInCurrency, useYcCrossBorderFlow } from "@/hooks/use-yc-cross-border-flow"
import {
  prefetchYcPayInNetworks,
  readCachedYcPayInNetworks,
} from "@/lib/yc-local-deposit-cache"
import {
  crossBorderQuoteToFlowState,
  ensureCrossBorderQuoteStashed,
  ensureCrossBorderOrderConfirmed,
  isCompleteCrossBorderQuote,
  isStashedCrossBorderQuoteFresh,
  isUsableCrossBorderQuotePreview,
  peekCrossBorderQuote,
  peekLastCrossBorderQuoteError,
  type CrossBorderQuoteStashMeta,
} from "@/lib/yc-cross-border-quote-cache"
import { YcMomoPhoneInput } from "@/components/yc-momo-phone-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { REVIEW_ROW_LABELS } from "@easner/shared"
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
  const [walletQuoteError, setWalletQuoteError] = useState<string | null>(null)
  const [ycQuoteError, setYcQuoteError] = useState<string | null>(null)
  const [momoPhone, setMomoPhone] = useState("")
  const [momoNetworkId, setMomoNetworkId] = useState("")
  const [momoNetworks, setMomoNetworks] = useState<{ id: string; name: string }[]>([])
  const [momoNetworksLoading, setMomoNetworksLoading] = useState(false)
  const displayIdFallbackRef = useRef<string | null>(null)

  const isYcCrossBorder = isYcCrossBorderFlow(state)
  const isYcMomo =
    isYcCrossBorder && state?.otherPaymentMethod === "mobile_money"

  const ycPreviewFlow = useYcCrossBorderFlow({
    recipientId: isYcMomo ? (state?.recipient.id ?? null) : null,
    enabled: isYcMomo && Boolean(state),
    receiveCurrency: state?.receiveCurrency ?? "",
    amountEntryMode: "receive",
    enteredAmount: state?.amount ?? 0,
    payInCurrencyOverride: state?.otherCurrency ?? null,
    payInCountryOverride: state?.otherCurrency
      ? residenceCountryFromPayInCurrency(state.otherCurrency) ?? null
      : null,
  })

  const displayTransactionId = useMemo(() => {
    if (isYcCrossBorder) {
      const etid = state?.ycCrossBorder?.easnerTransactionId?.trim()
      if (etid) return etid.toUpperCase()
      if (isYcMomo) return ""
    }
    const s = state?.transactionId?.trim()
    if (s) return s.toUpperCase()
    if (!displayIdFallbackRef.current) displayIdFallbackRef.current = generateTransactionId()
    return displayIdFallbackRef.current
  }, [isYcCrossBorder, isYcMomo, state?.transactionId, state?.ycCrossBorder?.easnerTransactionId])

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
    if (!state || !isYcMomo) return
    const payInCurrency = state.otherCurrency?.trim().toUpperCase()
    const payInCountry = payInCurrency ? residenceCountryFromPayInCurrency(payInCurrency) : null
    if (!payInCountry || !payInCurrency) return
    let cancelled = false
    const cached = readCachedYcPayInNetworks(payInCountry, payInCurrency)
    if (cached?.length) {
      setMomoNetworks(cached)
      if (cached.length === 1) setMomoNetworkId(cached[0].id)
    } else {
      setMomoNetworksLoading(true)
    }
    void (async () => {
      try {
        const rows = await prefetchYcPayInNetworks(payInCountry, payInCurrency)
        if (!cancelled) {
          setMomoNetworks(rows)
          if (rows.length === 1) setMomoNetworkId(rows[0].id)
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
          setMomoPhone((prev) =>
            prev ||
            (phone && payInCountry ? normalizeYcMomoPhone(phone, payInCountry) : phone),
          )
        }
      } catch {
        // optional prefill
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state, isYcMomo])

  useEffect(() => {
    if (!state || isYcCrossBorderFlow(state) || isEasenetRecipient(state.recipient) || isWalletRecipient(state.recipient) || !(state.amount > 0))
      return
    if (isPayoutQuoteFresh(state.payoutQuote, state.amount, state.recipient.id)) return
    let cancelled = false
    setPayoutQuoteError(null)
    void (async () => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (businessId) headers["X-Easner-Noah-Scope"] = "business"
        const res = await fetchWithSession("/api/payouts/quote", {
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
    if (!state || !isYcCrossBorderFlow(state) || !(state.amount > 0)) return
    if (state.otherPaymentMethod === "mobile_money") return

    const payInCurrency = state.otherCurrency!.toUpperCase()
    const payInCountry = residenceCountryFromPayInCurrency(payInCurrency)
    if (!payInCountry) {
      setYcQuoteError("Pay-in country could not be resolved.")
      return
    }

    const meta: CrossBorderQuoteStashMeta = {
      recipientId: state.recipient.id,
      payInCurrency,
      payInCountry,
      payInRail: "bank_transfer",
      receiveAmount: state.amount,
    }

    if (isStashedCrossBorderQuoteFresh(meta)) {
      const stashed = peekCrossBorderQuote()
      if (
        stashed &&
        state.ycCrossBorder?.localPayIn === stashed.localPayIn &&
        state.ycCrossBorder?.customerRate === stashed.customerRate
      ) {
        return
      }
      if (stashed) {
        const yc = crossBorderQuoteToFlowState(stashed, meta)
        const next: SendFlowState = {
          ...state,
          sendAmount: yc.localPayIn,
          sendCurrency: payInCurrency,
          totalAmount: yc.localPayIn,
          transactionId: yc.easnerTransactionId || yc.transactionId || state.transactionId,
          ycCrossBorder: yc,
        }
        setState(next)
        sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
      }
      return
    }

    let cancelled = false
    setYcQuoteError(null)
    void (async () => {
      const quote = await ensureCrossBorderQuoteStashed(meta)
      if (cancelled) return
      if (!isUsableCrossBorderQuotePreview(quote)) {
        setYcQuoteError(peekLastCrossBorderQuoteError() || "Cross-border quote failed")
        return
      }
      const yc = crossBorderQuoteToFlowState(quote, meta)
      const next: SendFlowState = {
        ...state,
        sendAmount: yc.localPayIn,
        sendCurrency: payInCurrency,
        totalAmount: yc.localPayIn,
        transactionId: yc.easnerTransactionId || yc.transactionId || state.transactionId,
        ycCrossBorder: yc,
      }
      setState(next)
      sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
    })()

    return () => {
      cancelled = true
    }
  }, [
    state?.recipient.id,
    state?.amount,
    state?.otherCurrency,
    state?.otherPaymentMethod,
    state?.ycCrossBorder?.transferId,
  ])

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

    if (isYcCrossBorderFlow(state)) {
      const payInCurrency = state.otherCurrency!.toUpperCase()
      const payInCountry = residenceCountryFromPayInCurrency(payInCurrency)
      const payInRail =
        state.otherPaymentMethod === "mobile_money" ? "mobile_money" : "bank_transfer"

      if (payInRail === "mobile_money") {
        setIsAuthorizing(true)
        try {
          if (!payInCountry) {
            setAuthorizeError("Pay-in country could not be resolved.")
            return
          }
          if (!momoPhone.trim() || !momoNetworkId) {
            setAuthorizeError("Mobile number and network are required.")
            return
          }
          const net = momoNetworks.find((n) => n.id === momoNetworkId)
          const meta: CrossBorderQuoteStashMeta = {
            recipientId: state.recipient.id,
            payInCurrency,
            payInCountry,
            payInRail: "mobile_money",
            receiveAmount: state.amount,
            sourcePhone: momoPhone.trim(),
            networkId: momoNetworkId,
            sourceNetworkName: net?.name,
          }
          const quote = await ensureCrossBorderOrderConfirmed(meta)
          if (!isCompleteCrossBorderQuote(quote)) {
            throw new Error(peekLastCrossBorderQuoteError() || "Could not confirm order")
          }
          const yc = crossBorderQuoteToFlowState(quote, meta)
          const next: SendFlowState = {
            ...state,
            sendAmount: yc.localPayIn,
            sendCurrency: payInCurrency,
            totalAmount: yc.localPayIn,
            transactionId: yc.easnerTransactionId || yc.transactionId,
            ycCrossBorder: yc,
          }
          setState(next)
          sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
          router.push("/send/authorize/yc-pay-in")
        } catch (e) {
          setAuthorizeError(e instanceof Error ? e.message : "Could not continue")
        } finally {
          setIsAuthorizing(false)
        }
        return
      }

      if (!state.ycCrossBorder?.transferId) {
        setIsAuthorizing(true)
        try {
          const payInCountry = residenceCountryFromPayInCurrency(payInCurrency)
          if (!payInCountry) {
            setAuthorizeError("Pay-in country could not be resolved.")
            return
          }
          const meta: CrossBorderQuoteStashMeta = {
            recipientId: state.recipient.id,
            payInCurrency,
            payInCountry,
            payInRail: "bank_transfer",
            receiveAmount: state.amount,
          }
          const quote = await ensureCrossBorderOrderConfirmed(meta)
          if (!isCompleteCrossBorderQuote(quote)) {
            throw new Error(peekLastCrossBorderQuoteError() || "Could not confirm order")
          }
          const yc = crossBorderQuoteToFlowState(quote, meta)
          const next: SendFlowState = {
            ...state,
            sendAmount: yc.localPayIn,
            sendCurrency: payInCurrency,
            totalAmount: yc.localPayIn,
            transactionId: yc.easnerTransactionId || yc.transactionId,
            ycCrossBorder: yc,
          }
          setState(next)
          sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(next))
          router.push("/send/authorize/yc-pay-in")
        } catch (e) {
          setAuthorizeError(e instanceof Error ? e.message : "Could not continue")
        } finally {
          setIsAuthorizing(false)
        }
        return
      }
      sessionStorage.setItem(SEND_FLOW_STATE_KEY_LOCAL, JSON.stringify(state))
      router.push("/send/authorize/yc-pay-in")
      return
    }

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
  const ycPayInCountry = state.otherCurrency
    ? residenceCountryFromPayInCurrency(state.otherCurrency.trim().toUpperCase())
    : null
  const quoteReady = isYcCrossBorder
    ? isYcMomo
      ? Boolean(ycPreviewFlow.customerRate && ycPreviewFlow.preview.sendAmount > 0)
      : Boolean(yc?.transferId)
    : easenetSend ||
      (walletSend
        ? isWalletQuoteFresh(wq, state.amount, state.recipient.id)
        : isPayoutQuoteFresh(pq, state.amount, state.recipient.id))
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
    ? isYcMomo
      ? (yc?.localPayIn ?? ycPreviewFlow.preview.sendAmount)
      : (yc?.localPayIn ?? state.sendAmount)
    : walletSend
      ? (wq?.sendAmount ?? state.sendAmount)
      : (pq?.customerPrincipal ?? pq?.sendAmount ?? state.sendAmount)
  const exchangeRate = isYcCrossBorder
    ? isYcMomo
      ? (yc?.customerRate ?? ycPreviewFlow.customerRate ?? 1)
      : (yc?.customerRate ?? 1)
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
    ? isYcMomo
      ? (yc?.localPayIn ?? ycPreviewFlow.preview.sendAmount)
      : (yc?.localPayIn ?? state.sendAmount)
    : walletSend
      ? (wq?.totalDebited ?? state.sendAmount)
      : (pq?.totalDebited ?? state.sendAmount)
  const walletTransferMethod = walletSend
    ? `${state.receiveCurrency} on ${state.recipient.walletNetwork?.trim() || wq?.receiveNetwork || "wallet"}`
    : transferMethod
  const authorizeDisabled = isYcCrossBorder
    ? isYcMomo
      ? isAuthorizing ||
        ycPreviewFlow.ratesLoading ||
        Boolean(ycQuoteError) ||
        !quoteReady ||
        !momoPhone.trim() ||
        !momoNetworkId
      : isAuthorizing || Boolean(ycQuoteError) || !yc?.transferId || quoteCountdown.expired
    : isAuthorizing ||
      Boolean((walletSend ? walletQuoteError : payoutQuoteError) && !easenetSend) ||
      (!easenetSend && (!quoteReady || quoteCountdown.expired))

  const tlcReviewBreakdown = resolveYcCrossBorderLocalPayInBreakdownForDisplay({
    localPayIn: totalDebited,
    payInCurrency: state.sendCurrency,
    receiveAmount: state.amount,
    customerRate: exchangeRate,
    provisionalPayIn: yc?.provisionalPayIn,
    displayProcessingFeeLocal: yc?.displayProcessingFeeLocal,
  })
  const tlcReviewPrincipalLocal = tlcReviewBreakdown.principalLocal
  const tlcReviewFeeLocal = tlcReviewBreakdown.feeLocal

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Review transfer</h1>
      </div>

      {isYcCrossBorder ? (
        <YcLocalPayInReview
          mode="cross_border_send"
          phase={isYcMomo ? "preview" : yc?.transferId ? "locked" : "preview"}
          rail={state.otherPaymentMethod === "mobile_money" ? "mobile_money" : "bank_transfer"}
          payInCurrency={state.sendCurrency}
          receiveCurrency={state.receiveCurrency}
          customerRate={exchangeRate}
          localPayIn={totalDebited}
          receiveAmount={state.amount}
          processingFeeLocal={tlcReviewFeeLocal}
          processingFeeUsd={yc?.processingFee}
          principalLocal={tlcReviewPrincipalLocal}
          transactionId={displayTransactionId || undefined}
          processingTime={arrivalHint ?? undefined}
          recipientNode={
            <SendSelectedRecipientSummary
              beneficiary={state.recipient}
              alignEnd
              className="min-w-0 max-w-[70%] shrink-0"
            />
          }
          quoteHint={
            !isYcMomo && yc?.expiresAt ? (
              <p className="text-xs text-muted-foreground pt-1">
                {quoteCountdown.expired
                  ? "Quote expired — go back and continue again."
                  : `Quote valid for ${quoteCountdown.label}`}
              </p>
            ) : null
          }
          footer={
            isYcMomo ? (
              <div className="pt-4 space-y-3">
                <div>
                  <Label htmlFor="send-momo-phone">{REVIEW_ROW_LABELS.mobileNumber}</Label>
                  {ycPayInCountry ? (
                    <YcMomoPhoneInput
                      id="send-momo-phone"
                      countryCode={ycPayInCountry}
                      value={momoPhone}
                      onChange={setMomoPhone}
                      className="mt-1"
                      placeholder="712345678"
                    />
                  ) : (
                    <Input
                      id="send-momo-phone"
                      value={momoPhone}
                      onChange={(e) => setMomoPhone(e.target.value)}
                      placeholder="+254712345678"
                      className="mt-1"
                    />
                  )}
                </div>
                <div>
                  <Label>{REVIEW_ROW_LABELS.paymentNetwork}</Label>
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
            ) : null
          }
        />
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

      {(isYcCrossBorder ? ycQuoteError : walletSend ? walletQuoteError : payoutQuoteError) &&
      !easenetSend ? (
        <p className="text-sm text-destructive">
          {isYcCrossBorder ? ycQuoteError : walletSend ? walletQuoteError : payoutQuoteError}
        </p>
      ) : null}
      {!easenetSend && !isYcMomo && (yc?.expiresAt || wq?.expiresAt || pq?.expiresAt) ? (
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
          ) : isYcCrossBorder ? (
            "Continue"
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
