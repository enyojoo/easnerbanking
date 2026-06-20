"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { SendRecipientPicker } from "@/components/send-recipient-picker"
import { formatSendRateLabel } from "@easner/shared"
import { getCurrencySymbol, getSendAmountFieldSymbol } from "@/lib/utils"
import {
  convertNoahSendFlowAmounts,
  hasNoahSendRateRow,
  noahSendRatesQueryPath,
  noahWalletRowsToRateMap,
  type NoahWalletRateRow,
} from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import type { Beneficiary } from "@/lib/recipient-types"
import type { PaymentMethodCode } from "@/lib/send-payment-methods"
import {
  ChevronDown,
  Check,
  ChevronRight,
  ArrowLeft,
  ArrowUpDown,
  Landmark,
  AlertCircle,
  Loader2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { generateTransactionId } from "@/lib/transaction-id"
import { CurrencyFlag } from "@/components/flags"
import { useBusinessProfile } from "@/lib/use-business-profile"
import {
  type SendFlowState,
  SEND_FLOW_STATE_KEY,
  persistSendFlowState,
} from "@/lib/send-flow-session"
import { useManualSendFlow } from "@/hooks/use-manual-send-flow"
import { PaymentMethodDisplayLogo } from "@/components/send/payment-method-display-logo"
import { pickDefaultManualPayInOption } from "@easner/shared"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { usePayoutFormSchema } from "@/lib/use-payout-form-schema"
import {
  exchangeRatesToRateMap,
  resolveEffectivePayoutMin,
  resolveEffectiveWalletSendMin,
  getSendAmountNoteFieldUi,
  validatePayoutAmountAgainstLimits,
  validateSendAmountFields,
} from "@easner/shared"
import { mapPayoutQuoteToFlowState } from "@/lib/noah/map-payout-quote-to-flow"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import {
  mapWalletQuoteToFlowState,
} from "@/lib/wallet-send/map-wallet-quote-to-flow"
import type { WalletSendQuoteResult } from "@/lib/wallet-send/wallet-send-quote"
import { usePayoutMinEnforcement } from "@/hooks/use-payout-min-enforcement"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function formatAmountForDisplay(raw: string): string {
  if (!raw || raw === ".") return raw || ""
  const cleaned = raw.replace(/,/g, "")
  const parts = cleaned.split(".")
  let intPart = (parts[0] || "0").replace(/\D/g, "")
  if (intPart.length > 1) {
    intPart = intPart.replace(/^0+/, "") || "0"
  }
  const decPart = (parts[1] || "").replace(/\D/g, "").slice(0, 2)
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  if (parts.length > 1) {
    return decPart ? `${formattedInt}.${decPart}` : `${formattedInt}.`
  }
  return formattedInt
}

function parseAmountFromDisplay(display: string): number {
  return Number.parseFloat(display.replace(/,/g, "")) || 0
}

export default function SendPage() {
  const router = useRouter()
  const { tier1Complete, hasData, isLoading: profileLoading, businessId } = useBusinessProfile()
  const { accountRows: sourceAccounts } = useBusinessAccountRows()
  const [recipient, setRecipient] = useState<Beneficiary | null>(null)
  const [amountStr, setAmountStr] = useState("")
  const [amountEntryMode, setAmountEntryMode] = useState<"receive" | "send">("receive")
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>("balance")
  const isBalanceSource = paymentMethod === "balance"
  const [otherCurrency, setOtherCurrency] = useState<string | null>(null)
  const [otherPaymentMethod, setOtherPaymentMethod] = useState<string | null>(null)
  const [manualPaymentMethodId, setManualPaymentMethodId] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [paymentPurpose, setPaymentPurpose] = useState("")
  const [amountFieldError, setAmountFieldError] = useState<string | null>(null)
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false)
  const payoutQuoteCacheRef = useRef<{ key: string; quote: PayoutQuoteResult } | null>(null)
  const payoutQuoteInflightRef = useRef<Promise<PayoutQuoteResult | null> | null>(null)
  const payoutQuoteInflightKeyRef = useRef("")
  const [payoutQuotePreview, setPayoutQuotePreview] = useState<PayoutQuoteResult | null>(null)
  const walletQuoteCacheRef = useRef<{ key: string; quote: WalletSendQuoteResult } | null>(null)
  const walletQuoteInflightRef = useRef<Promise<WalletSendQuoteResult | null> | null>(null)
  const walletQuoteInflightKeyRef = useRef("")
  const [walletQuotePreview, setWalletQuotePreview] = useState<WalletSendQuoteResult | null>(null)
  const [noahFxRates, setNoahFxRates] = useState<Record<string, number>>({})
  const [noahRateRows, setNoahRateRows] = useState<NoahWalletRateRow[]>([])
  const [noahRatesLoading, setNoahRatesLoading] = useState(false)
  const [isContinuePending, setIsContinuePending] = useState(false)
  const [isContinueLoading, setIsContinueLoading] = useState(false)
  const continueSpinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem(SEND_FLOW_STATE_KEY)
    if (raw) {
      try {
        const s = JSON.parse(raw) as SendFlowState
        setRecipient(s.recipient)
        setAmountStr(s.amount > 0 ? formatAmountForDisplay(String(s.amount)) : "")
        setSourceAccountId(s.sourceAccountId ?? null)
        setPaymentMethod(s.paymentMethod ?? "balance")
        setOtherCurrency(s.otherCurrency ?? null)
        setOtherPaymentMethod(s.otherPaymentMethod ?? null)
        setNote(s.note || "")
        setPaymentPurpose(s.paymentPurpose || "")
      } catch {
        // ignore
      }
    }
  }, [])

  const enteredAmount = parseAmountFromDisplay(amountStr)
  const receiveCurrency = recipient?.currency ?? "USD"
  const sourceAccount = sourceAccounts.find((a) => a.id === sourceAccountId)
  const isEasetagRecipient = Boolean(recipient?.payeeEasetag?.trim())
  const isWalletRecipient =
    Boolean(recipient?.walletNetwork) || /wallet/i.test(recipient?.bankName || "")

  const manualSend = useManualSendFlow({
    enabled: !isEasetagRecipient,
    otherCurrency,
    receiveCurrency,
    amountEntryMode,
    enteredAmount,
  })

  const manualSendAvailable = manualSend.sendCurrencies.length > 0
  /** Easetag P2P is balance-only; manual pay-in rails are not supported. */
  const showManualSendPaymentOptions = manualSendAvailable && !isEasetagRecipient

  const otherCurrencies = useMemo(
    () => manualSend.sendCurrencyOptions,
    [manualSend.sendCurrencyOptions],
  )

  const currencyPaymentMethods = useMemo(() => {
    const by = manualSend.paymentMethodsByCurrency
    const out: Record<
      string,
      Array<{ code: string; name: string; type: string; displayLogoUrl?: string | null }>
    > = {}
    for (const code of manualSend.sendCurrencies) {
      const opts = by[code] ?? []
      if (opts.length > 0) {
        out[code] = opts.map((o) => ({
          code: o.id,
          name: o.name,
          type: o.type,
          displayLogoUrl: o.display_logo_url,
        }))
      }
    }
    return out
  }, [manualSend.paymentMethodsByCurrency, manualSend.sendCurrencies])

  useEffect(() => {
    if (manualSendAvailable) return
    if (
      paymentMethod === "otherCurrency" ||
      otherCurrency ||
      paymentMethod === "usdc" ||
      paymentMethod === "usdt"
    ) {
      setPaymentMethod("balance")
      setOtherCurrency(null)
      setOtherPaymentMethod(null)
      setManualPaymentMethodId(null)
    }
  }, [manualSendAvailable, paymentMethod, otherCurrency])

  useEffect(() => {
    if (!isEasetagRecipient) return
    if (
      paymentMethod === "otherCurrency" ||
      otherCurrency ||
      otherPaymentMethod ||
      manualPaymentMethodId
    ) {
      setPaymentMethod("balance")
      setOtherCurrency(null)
      setOtherPaymentMethod(null)
      setManualPaymentMethodId(null)
    }
  }, [isEasetagRecipient, paymentMethod, otherCurrency, otherPaymentMethod, manualPaymentMethodId])

  useEffect(() => {
    if (!otherCurrency) return
    const opts = currencyPaymentMethods[otherCurrency] ?? []
    if (!manualPaymentMethodId && opts.length > 0) {
      const def = pickDefaultManualPayInOption(
        manualSend.paymentMethodsByCurrency[otherCurrency] ?? [],
      )
      if (def) {
        setManualPaymentMethodId(def.id)
        setOtherPaymentMethod(def.id)
      }
    }
  }, [otherCurrency, currencyPaymentMethods, manualPaymentMethodId, manualSend.paymentMethodsByCurrency])

  useEffect(() => {
    const dest = (recipient?.currency || "").trim().toUpperCase()
    if (!dest || dest.length !== 3 || isWalletRecipient) {
      if (!isWalletRecipient) setNoahRatesLoading(false)
      return
    }
    let cancelled = false
    setNoahRatesLoading(true)
    void (async () => {
      try {
        const res = await fetchWithSession(noahSendRatesQueryPath(dest))
        const data = (await res.json().catch(() => ({}))) as {
          rates?: NoahWalletRateRow[]
        }
        if (!res.ok || cancelled) return
        const rows = data.rates || []
        setNoahRateRows(rows)
        setNoahFxRates(noahWalletRowsToRateMap(rows))
      } catch {
        if (!cancelled) {
          setNoahFxRates({})
          setNoahRateRows([])
        }
      } finally {
        if (!cancelled) setNoahRatesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recipient?.currency, isWalletRecipient])

  useEffect(() => {
    if (isWalletRecipient && amountEntryMode !== "receive") {
      setAmountEntryMode("receive")
    }
  }, [isWalletRecipient, amountEntryMode, recipient?.id])

  const sendCurrency = useMemo(() => {
    if (paymentMethod === "balance" && sourceAccount) return sourceAccount.currency
    if (paymentMethod === "usdc" || paymentMethod === "usdt") return "USD"
    if (otherCurrency) return otherCurrency
    return "USD"
  }, [paymentMethod, sourceAccount, otherCurrency])

  const flowAmounts = useMemo(() => {
    if (!recipient || enteredAmount <= 0) {
      return { sendAmount: 0, receiveAmount: 0, forwardRate: 1 }
    }
    const crossCurrency = sendCurrency !== receiveCurrency
    if (otherCurrency && crossCurrency) {
      if (manualSend.quote) {
        return {
          sendAmount: manualSend.quote.sendAmount,
          receiveAmount: manualSend.quote.receiveAmount,
          forwardRate: manualSend.quote.exchangeRate,
        }
      }
      // Don't preview Noah/reference rates while the manual quote is in flight.
      return { sendAmount: 0, receiveAmount: 0, forwardRate: 1 }
    }
    if (isWalletRecipient) {
      return { sendAmount: enteredAmount, receiveAmount: enteredAmount, forwardRate: 1 }
    }
    return convertNoahSendFlowAmounts({
      direction: amountEntryMode,
      amount: enteredAmount,
      sendCurrency,
      receiveCurrency,
      rateMap: noahFxRates,
    })
  }, [
    recipient,
    enteredAmount,
    amountEntryMode,
    sendCurrency,
    receiveCurrency,
    noahFxRates,
    isWalletRecipient,
    otherCurrency,
    manualSend.quote,
  ])

  const sendAmount = flowAmounts.sendAmount
  const receiveAmount = flowAmounts.receiveAmount
  const quotedTotalDebited = isWalletRecipient
    ? walletQuotePreview?.totalDebited
    : payoutQuotePreview?.totalDebited
  const balanceDebitAmount =
    quotedTotalDebited != null && quotedTotalDebited > 0 ? quotedTotalDebited : sendAmount

  const hasFx =
    !isWalletRecipient &&
    receiveCurrency !== sendCurrency &&
    receiveAmount > 0 &&
    sendAmount > 0
  const forwardRate = flowAmounts.forwardRate
  const rateDisplay = hasFx ? formatSendRateLabel(sendCurrency, receiveCurrency, forwardRate) : null

  const needsNoahRateForSend =
    isBalanceSource &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    sendCurrency !== receiveCurrency

  const activeNoahRateRow = useMemo(() => {
    const send = sendCurrency.trim().toUpperCase()
    const receive = receiveCurrency.trim().toUpperCase()
    return (
      noahRateRows.find((r) => r.from_currency === send && r.to_currency === receive) ?? null
    )
  }, [noahRateRows, sendCurrency, receiveCurrency])

  const hasValidNoahRateForPair =
    !needsNoahRateForSend || hasNoahSendRateRow(activeNoahRateRow)

  const manualQuoteEnabled =
    paymentMethod === "otherCurrency" &&
    Boolean(otherCurrency) &&
    sendCurrency !== receiveCurrency &&
    enteredAmount > 0

  const manualQuoteLoading = manualQuoteEnabled && manualSend.quoteLoading && !manualSend.quote

  const exchangePreviewReady =
    sendCurrency === receiveCurrency ||
    isWalletRecipient ||
    (manualQuoteEnabled
      ? Boolean(manualSend.quote)
      : !needsNoahRateForSend || hasValidNoahRateForPair)

  const displayBalanceForSource =
    sourceAccount && paymentMethod === "balance"
      ? sourceAccount.availableBalance - (balanceDebitAmount > 0 ? balanceDebitAmount : 0)
      : 0

  const suggestedAccount = useMemo(() => {
    const usdAccount = sourceAccounts.find((a) => a.currency === "USD")
    if (!recipient || receiveAmount <= 0) return usdAccount ?? sourceAccounts[0]
    const matching = sourceAccounts.find(
      (a) => a.currency === receiveCurrency && a.availableBalance >= balanceDebitAmount
    )
    if (matching) return matching
    const sufficient = sourceAccounts.find((a) => a.availableBalance >= balanceDebitAmount)
    return sufficient ?? usdAccount ?? sourceAccounts[0]
  }, [recipient, receiveAmount, receiveCurrency, balanceDebitAmount, sourceAccounts])

  useEffect(() => {
    if (recipient && !sourceAccountId && paymentMethod === "balance" && suggestedAccount) {
      setSourceAccountId(suggestedAccount.id)
    }
  }, [recipient, sourceAccountId, paymentMethod, suggestedAccount])

  useEffect(() => {
    payoutQuoteCacheRef.current = null
    payoutQuoteInflightRef.current = null
    payoutQuoteInflightKeyRef.current = ""
    setPayoutQuotePreview(null)
    walletQuoteCacheRef.current = null
    walletQuoteInflightRef.current = null
    walletQuoteInflightKeyRef.current = ""
    setWalletQuotePreview(null)
  }, [recipient?.id])

  /** Easenet balance send: need org context loaded before Continue (Noah scope on transfer). */
  const needsProfileBeforeEasenetSend =
    isBalanceSource &&
    recipient !== null &&
    Boolean(recipient.payeeEasetag?.trim())
  const hasValidOtherCurrencySelection =
    showManualSendPaymentOptions &&
    Boolean(otherCurrency) &&
    paymentMethod === "otherCurrency" &&
    Boolean(manualPaymentMethodId || otherPaymentMethod)

  const payoutRail =
    recipient && /mobile money/i.test(recipient.bankName || "")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)
  const { hints: payoutHints } = usePayoutFormSchema({
    countryCode: recipient?.countryCode,
    currencyCode: recipient?.currency,
    rail: payoutRail,
  })
  const amountFieldMode = payoutHints?.amount_field_mode ?? "note_optional_only"
  const noteFieldUi = getSendAmountNoteFieldUi({
    hints: payoutHints,
    isEasetag: isEasetagRecipient,
    receiveCurrency,
  })

  const payoutMinReceive = useMemo(
    () =>
      recipient && !isEasetagRecipient
        ? resolveEffectivePayoutMin({
            hints: payoutHints,
            currencyCode: receiveCurrency,
            rail: payoutRail,
          })
        : null,
    [recipient, isEasetagRecipient, payoutHints, receiveCurrency, payoutRail],
  )

  const manualFxRateMap = useMemo(
    () => exchangeRatesToRateMap(manualSend.catalog?.exchangeRates ?? []),
    [manualSend.catalog?.exchangeRates],
  )

  const payoutEnforcementRateMap =
    paymentMethod === "otherCurrency" ? manualFxRateMap : noahFxRates

  const payoutMinEnforcementEnabled =
    Boolean(recipient) &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    (isBalanceSource ||
      (paymentMethod === "otherCurrency" && Boolean(otherCurrency)))

  const payoutMinSeedKey = recipient
    ? `${recipient.id}:${receiveCurrency}:${payoutRail}:${paymentMethod}:${otherCurrency ?? ""}`
    : null

  usePayoutMinEnforcement({
    enabled: payoutMinEnforcementEnabled,
    seedKey: payoutMinSeedKey,
    minReceive: payoutMinReceive,
    amountEntryMode,
    enteredAmount,
    sendCurrency,
    receiveCurrency,
    rateMap: payoutEnforcementRateMap,
    manualQuote: manualSend.quote,
    useManualQuote:
      paymentMethod === "otherCurrency" &&
      Boolean(otherCurrency) &&
      receiveCurrency !== sendCurrency &&
      Boolean(manualSend.quote),
    onApplyEnteredAmount: (amount) => {
      setAmountStr(formatAmountForDisplay(amount.toFixed(2)))
    },
  })

  const walletMinReceive = useMemo(() => {
    if (!isWalletRecipient) {
      return resolveEffectiveWalletSendMin({
        receiveCurrency,
        receiveNetwork: "Solana",
        customerRate: 1,
      })
    }
    const network = (recipient?.walletNetwork || "").trim()
    if (!network) {
      return resolveEffectiveWalletSendMin({
        receiveCurrency,
        receiveNetwork: "Solana",
        customerRate: 1,
      })
    }
    return resolveEffectiveWalletSendMin({
      receiveCurrency,
      receiveNetwork: network,
      customerRate: 1,
    })
  }, [isWalletRecipient, recipient?.walletNetwork, receiveCurrency])

  const walletMinEnforcementEnabled = isWalletRecipient && isBalanceSource

  const walletMinSeedKey =
    recipient?.walletNetwork?.trim()
      ? `${recipient.id}:${receiveCurrency}:${recipient.walletNetwork}:${sendCurrency}`
      : null

  usePayoutMinEnforcement({
    enabled: walletMinEnforcementEnabled,
    seedKey: walletMinSeedKey,
    minReceive: walletMinReceive,
    amountEntryMode: "receive",
    enteredAmount,
    sendCurrency,
    receiveCurrency,
    rateMap: {},
    onApplyEnteredAmount: (amount) => {
      setAmountStr(formatAmountForDisplay(amount.toFixed(2)))
    },
  })

  const payoutReceiveBelowMin =
    payoutMinReceive != null &&
    receiveAmount > 0 &&
    receiveAmount < payoutMinReceive

  const walletReceiveBelowMin =
    isWalletRecipient && receiveAmount > 0 && receiveAmount < walletMinReceive

  const manualAmountOutOfRange =
    Boolean(
      otherCurrency &&
        manualSend.quote &&
        ((manualSend.quote.minAmount != null && sendAmount < manualSend.quote.minAmount) ||
          (manualSend.quote.maxAmount != null && sendAmount > manualSend.quote.maxAmount)),
    )

  const canContinueBalance =
    recipient !== null &&
    receiveAmount > 0 &&
    sourceAccountId !== null &&
    sourceAccount &&
    sourceAccount.availableBalance >= balanceDebitAmount &&
    isBalanceSource &&
    tier1Complete &&
    (isWalletRecipient || hasValidNoahRateForPair) &&
    !payoutReceiveBelowMin &&
    !walletReceiveBelowMin &&
    (!needsProfileBeforeEasenetSend || (hasData && !profileLoading))

  const canContinueOtherCurrency =
    recipient !== null &&
    receiveAmount > 0 &&
    hasValidOtherCurrencySelection &&
    tier1Complete &&
    !manualAmountOutOfRange &&
    !payoutReceiveBelowMin &&
    exchangePreviewReady

  const canContinue = isBalanceSource ? canContinueBalance : canContinueOtherCurrency

  const isAuthorizeFlow = !isBalanceSource

  const hasInsufficientBalance =
    isBalanceSource &&
    sourceAccount &&
    receiveAmount > 0 &&
    sourceAccount.availableBalance < balanceDebitAmount

  const formatSwitchAmount = (raw: number): string => {
    const rounded = Math.round((Number.isFinite(raw) ? raw : 0) * 100) / 100
    const frac = Math.abs(rounded - Math.trunc(rounded))
    const nextRaw = frac >= 0.01 ? rounded.toFixed(2) : String(Math.trunc(rounded))
    return formatAmountForDisplay(nextRaw)
  }

  const handleToggleAmountDirection = () => {
    if (!recipient || !hasFx) return
    if (amountEntryMode === "receive") {
      if (sendAmount <= 0) return
      setAmountEntryMode("send")
      setAmountStr(formatSwitchAmount(sendAmount))
      return
    }
    if (receiveAmount <= 0) return
    setAmountEntryMode("receive")
    setAmountStr(formatSwitchAmount(receiveAmount))
  }

  const amountInputCurrency = amountEntryMode === "receive" ? receiveCurrency : sendCurrency
  const shortfallAmount =
    hasInsufficientBalance && sourceAccount
      ? sendAmount - sourceAccount.availableBalance
      : 0

  const getSourceDisplayLabel = () => {
    if (paymentMethod === "balance" && sourceAccount) {
      const fig = displayBalanceForSource.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      return `${sourceAccount.currency} Balance • ${getCurrencySymbol(sourceAccount.currency)}${fig}`
    }
    if (otherCurrency && otherPaymentMethod) {
      const method = currencyPaymentMethods[otherCurrency]?.find(
        (m) => m.code === otherPaymentMethod
      )
      return `${otherCurrency} • ${method?.name ?? otherPaymentMethod}`
    }
    return "Select method"
  }

  const needsPayoutQuoteBeforeConfirm =
    isBalanceSource &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    receiveAmount > 0

  const needsWalletQuoteBeforeConfirm =
    isBalanceSource &&
    isWalletRecipient &&
    receiveAmount > 0

  const walletQuoteCacheKey = useMemo(() => {
    if (!recipient?.id || !(receiveAmount > 0)) return ""
    return [recipient.id, receiveAmount, sendCurrency].join("|")
  }, [recipient?.id, receiveAmount, sendCurrency])

  const payoutQuoteCacheKey = useMemo(() => {
    if (!recipient?.id || !(receiveAmount > 0)) return ""
    return [
      recipient.id,
      amountEntryMode,
      amountEntryMode === "send" ? sendAmount : receiveAmount,
      sendCurrency,
      note.trim(),
      paymentPurpose.trim(),
    ].join("|")
  }, [recipient?.id, amountEntryMode, sendAmount, receiveAmount, sendCurrency, note, paymentPurpose])

  const fetchPayoutQuote = useCallback(async (): Promise<PayoutQuoteResult | null> => {
    if (!needsPayoutQuoteBeforeConfirm || !payoutQuoteCacheKey || !recipient?.id) return null
    const cached = payoutQuoteCacheRef.current
    if (cached?.key === payoutQuoteCacheKey) return cached.quote
    if (
      payoutQuoteInflightRef.current &&
      payoutQuoteInflightKeyRef.current === payoutQuoteCacheKey
    ) {
      return payoutQuoteInflightRef.current
    }

    const promise = (async () => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (businessId) headers["X-Easner-Noah-Scope"] = "business"
        const res = await fetchWithSession("/api/noah/payouts/quote", {
          method: "POST",
          headers,
          body: JSON.stringify({
            recipientId: recipient.id,
            receiveAmount,
            sourceBalanceCurrency: sendCurrency,
            amountEntryMode,
            ...(amountEntryMode === "send" && sendAmount > 0 ? { sendAmount } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            ...(paymentPurpose.trim() ? { paymentPurpose: paymentPurpose.trim() } : {}),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          quote?: PayoutQuoteResult
        }
        if (!res.ok || !data.ok || !data.quote) return null
        payoutQuoteCacheRef.current = { key: payoutQuoteCacheKey, quote: data.quote }
        setPayoutQuotePreview(data.quote)
        return data.quote
      } catch {
        setPayoutQuotePreview(null)
        return null
      }
    })()

    payoutQuoteInflightKeyRef.current = payoutQuoteCacheKey
    payoutQuoteInflightRef.current = promise
    try {
      return await promise
    } finally {
      payoutQuoteInflightRef.current = null
      payoutQuoteInflightKeyRef.current = ""
    }
  }, [
    needsPayoutQuoteBeforeConfirm,
    payoutQuoteCacheKey,
    recipient?.id,
    receiveAmount,
    sendAmount,
    amountEntryMode,
    sendCurrency,
    note,
    paymentPurpose,
    businessId,
  ])

  const fetchWalletQuote = useCallback(async (): Promise<WalletSendQuoteResult | null> => {
    if (!needsWalletQuoteBeforeConfirm || !walletQuoteCacheKey || !recipient?.id) return null
    const cached = walletQuoteCacheRef.current
    if (cached?.key === walletQuoteCacheKey) return cached.quote
    if (
      walletQuoteInflightRef.current &&
      walletQuoteInflightKeyRef.current === walletQuoteCacheKey
    ) {
      return walletQuoteInflightRef.current
    }

    const promise = (async () => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (businessId) headers["X-Easner-Noah-Scope"] = "business"
        const res = await fetchWithSession("/api/wallets/send/quote", {
          method: "POST",
          headers,
          body: JSON.stringify({
            recipientId: recipient.id,
            sourceBalanceCurrency: sendCurrency,
            amountEntryMode: "receive",
            receiveAmount,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          quote?: WalletSendQuoteResult
          error?: string
        }
        if (!res.ok || !data.ok || !data.quote) return null
        walletQuoteCacheRef.current = { key: walletQuoteCacheKey, quote: data.quote }
        setWalletQuotePreview(data.quote)
        return data.quote
      } catch {
        setWalletQuotePreview(null)
        return null
      }
    })()

    walletQuoteInflightKeyRef.current = walletQuoteCacheKey
    walletQuoteInflightRef.current = promise
    try {
      return await promise
    } finally {
      walletQuoteInflightRef.current = null
      walletQuoteInflightKeyRef.current = ""
    }
  }, [
    needsWalletQuoteBeforeConfirm,
    walletQuoteCacheKey,
    recipient?.id,
    receiveAmount,
    sendAmount,
    amountEntryMode,
    sendCurrency,
    businessId,
  ])

  useEffect(() => {
    if (!needsWalletQuoteBeforeConfirm || !walletQuoteCacheKey || !recipient?.id) return
    void fetchWalletQuote()
  }, [needsWalletQuoteBeforeConfirm, walletQuoteCacheKey, recipient?.id, fetchWalletQuote])

  useEffect(() => {
    if (!needsPayoutQuoteBeforeConfirm || !payoutQuoteCacheKey || !recipient?.id) return
    void fetchPayoutQuote()
  }, [needsPayoutQuoteBeforeConfirm, payoutQuoteCacheKey, recipient?.id, fetchPayoutQuote])

  const handleContinue = async () => {
    if (!canContinue || !recipient || isContinuePending || isContinueLoading) return
    if (isEasetagRecipient && paymentMethod === "otherCurrency") {
      setAmountFieldError("Easetag sends are only supported from your balance.")
      return
    }
    const fieldCheck = validateSendAmountFields({
      hints: payoutHints,
      note,
      paymentPurpose,
      isEasetag: isEasetagRecipient,
      receiveCurrency,
    })
    if (!fieldCheck.ok) {
      setAmountFieldError(fieldCheck.message)
      return
    }
    if (
      !isEasetagRecipient &&
      !isWalletRecipient &&
      (isBalanceSource || paymentMethod === "otherCurrency") &&
      receiveAmount > 0
    ) {
      const limitCheck = validatePayoutAmountAgainstLimits({
        amount: receiveAmount,
        hints: payoutHints,
        currencyCode: receiveCurrency,
        rail: payoutRail,
      })
      if (!limitCheck.ok) {
        setAmountFieldError(limitCheck.message)
        return
      }
    }
    setAmountFieldError(null)
    const transactionId = generateTransactionId()

    const feeAmount = otherCurrency && manualSend.quote ? manualSend.quote.feeAmount : 0
    const totalAmount = otherCurrency && manualSend.quote ? manualSend.quote.totalAmount : sendAmount

    const walletAmountEntryMode = isWalletRecipient ? ("receive" as const) : amountEntryMode

    const state: SendFlowState = {
      recipient: coerceBeneficiaryEasenetDisplay(recipient),
      amount: receiveAmount,
      receiveCurrency,
      sendAmount,
      sendCurrency,
      amountEntryMode: walletAmountEntryMode,
      sourceAccountId: sourceAccount?.id,
      paymentMethod,
      otherCurrency: otherCurrency ?? undefined,
      otherPaymentMethod: otherPaymentMethod ?? undefined,
      manualPaymentMethodId: manualPaymentMethodId ?? undefined,
      manualQuote: manualSend.quote ?? undefined,
      feeAmount,
      totalAmount,
      note: isWalletRecipient ? "" : note.trim(),
      ...(paymentPurpose.trim() ? { paymentPurpose: paymentPurpose.trim() } : {}),
      transactionId,
    }
    let flowState = state
    const needsQuoteAwait = needsPayoutQuoteBeforeConfirm || needsWalletQuoteBeforeConfirm
    const quoteAlreadyWarm =
      (needsWalletQuoteBeforeConfirm &&
        walletQuoteCacheRef.current?.key === walletQuoteCacheKey) ||
      (needsPayoutQuoteBeforeConfirm &&
        payoutQuoteCacheRef.current?.key === payoutQuoteCacheKey)
    if (needsQuoteAwait && !quoteAlreadyWarm) {
      setIsContinuePending(true)
      continueSpinnerTimerRef.current = setTimeout(() => setIsContinueLoading(true), 175)
    }
    try {
      if (needsPayoutQuoteBeforeConfirm) {
        const quote = await fetchPayoutQuote()
        if (!quote?.noah?.formSessionId) {
          setAmountFieldError("Could not load payout quote. Try again.")
          return
        }
        flowState = mapPayoutQuoteToFlowState(state, quote)
      } else if (needsWalletQuoteBeforeConfirm) {
        const quote = await fetchWalletQuote()
        if (!quote?.formSessionId) {
          setAmountFieldError("Could not load wallet send quote. Try again.")
          return
        }
        flowState = mapWalletQuoteToFlowState(state, quote)
      }

      persistSendFlowState(flowState)

      if (isBalanceSource) {
        router.push("/send/confirm")
        return
      }

      if (paymentMethod === "otherCurrency" && manualPaymentMethodId) {
        router.push(manualSend.authorizePathForPaymentMethodId(manualPaymentMethodId))
        return
      }

      router.push("/send/confirm")
    } finally {
      if (continueSpinnerTimerRef.current) {
        clearTimeout(continueSpinnerTimerRef.current)
        continueSpinnerTimerRef.current = null
      }
      setIsContinuePending(false)
      setIsContinueLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Send money</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select recipient, amount, and how you&apos;d like to send
        </p>
      </div>

      <SendRecipientPicker
        selected={recipient}
        onSelect={setRecipient}
      />

      {recipient && (
        <div className="space-y-2">
          <div
            className={`flex items-center justify-between gap-3 ${
              receiveCurrency !== sendCurrency ? "min-h-[2.5rem]" : ""
            }`}
          >
            <Label className="text-muted-foreground mb-0 shrink-0 text-sm font-medium leading-none">
              Amount ({amountEntryMode === "receive" ? receiveCurrency : sendCurrency})
            </Label>
            {receiveCurrency !== sendCurrency && !isWalletRecipient ? (
              <div className="flex min-w-0 flex-1 items-center justify-end text-sm text-muted-foreground">
                {manualQuoteLoading ? (
                  <Skeleton className="h-4 w-52 max-w-full" />
                ) : manualQuoteEnabled && !manualSend.quote ? (
                  <span className="text-destructive text-xs">
                    {manualSend.quoteError ?? "Exchange rate unavailable. Try again shortly."}
                  </span>
                ) : needsNoahRateForSend && noahRatesLoading ? (
                  <Skeleton className="h-4 w-52 max-w-full" />
                ) : needsNoahRateForSend && !hasValidNoahRateForPair ? (
                  <span className="text-destructive text-xs">
                    Exchange rate unavailable. Try again shortly.
                  </span>
                ) : hasFx && rateDisplay ? (
                  <div className="flex max-w-full items-center justify-end gap-x-1 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={handleToggleAmountDirection}
                      className="inline-flex min-w-0 max-w-full items-center gap-1 hover:text-foreground"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                      <span className="min-w-0 truncate">
                        {amountEntryMode === "receive" ? "Sending" : "Receiving"}:{" "}
                        {getSendAmountFieldSymbol(
                          amountEntryMode === "receive" ? sendCurrency : receiveCurrency,
                        )}
                        {(amountEntryMode === "receive" ? sendAmount : receiveAmount).toLocaleString("en-US", {
                          minimumFractionDigits:
                            Math.abs((amountEntryMode === "receive" ? sendAmount : receiveAmount) % 1) >= 0.01
                              ? 2
                              : 0,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </button>
                    <span className="shrink-0">• Rate: {rateDisplay}</span>
                  </div>
                ) : (
                  <span className="pointer-events-none select-none text-sm leading-none opacity-0" aria-hidden>
                    .
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <div
            className="flex h-[100px] shrink-0 items-center justify-center box-border rounded-xl border-2 border-input bg-background px-6 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-colors gap-0.5"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <span className="font-black text-foreground select-none shrink-0 text-5xl">
              {getSendAmountFieldSymbol(amountInputCurrency)}
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "")
                const parts = v.split(".")
                if (parts.length > 2) return
                if (parts[1]?.length > 2) return
                setAmountStr(formatAmountForDisplay(v))
              }}
              className="w-full min-w-0 bg-transparent border-0 outline-none font-black text-foreground text-5xl placeholder:text-muted-foreground/50 focus:ring-0 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          {hasInsufficientBalance && sourceAccount && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Insufficient {sourceAccount.currency} balance. You need{" "}
                {getCurrencySymbol(sourceAccount.currency)}
                {shortfallAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} more, or choose another source.
              </span>
            </div>
          )}
        </div>
      )}

      {recipient && (
        <div className="space-y-2">
          <Label>Sending from</Label>
          <button
            type="button"
            onClick={() => setSourceSheetOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border border-input bg-background px-4 py-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-ring"
          >
            <div className="flex items-center gap-2">
              <span className="flex items-center">
                {paymentMethod === "balance" && sourceAccount ? (
                  <CurrencyFlag currency={sourceAccount.currency} size={22} className="shrink-0" />
                ) : otherCurrency ? (
                  <CurrencyFlag currency={otherCurrency} size={22} className="shrink-0" />
                ) : (
                  <Landmark className="h-5 w-5 text-muted-foreground" />
                )}
              </span>
              <div>
                <p
                  className={`font-medium${
                    paymentMethod === "balance" &&
                    sourceAccount &&
                    sendAmount > 0 &&
                    displayBalanceForSource < 0
                      ? " text-destructive"
                      : ""
                  }`}
                >
                  {getSourceDisplayLabel()}
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </div>
      )}

      {recipient && !isWalletRecipient && amountFieldMode === "payment_purpose" ? (
        <div className="space-y-2">
          <Label htmlFor="payment-purpose">Payment purpose</Label>
          <Select value={paymentPurpose} onValueChange={setPaymentPurpose}>
            <SelectTrigger id="payment-purpose" className="h-11">
              <SelectValue placeholder="Select purpose" />
            </SelectTrigger>
            <SelectContent>
              {(payoutHints?.payment_purpose_enum ?? []).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {amountFieldError ? <p className="text-sm text-destructive">{amountFieldError}</p> : null}
        </div>
      ) : recipient && !isWalletRecipient ? (
        <div className="space-y-2">
          <Label htmlFor="note">{noteFieldUi.label}</Label>
          <Input
            id="note"
            placeholder={noteFieldUi.placeholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11"
          />
          {amountFieldError ? <p className="text-sm text-destructive">{amountFieldError}</p> : null}
        </div>
      ) : null}

      <Button
        size="lg"
        className="w-full h-12"
        disabled={!canContinue || isContinuePending || isContinueLoading}
        onClick={handleContinue}
      >
        {isContinueLoading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {isAuthorizeFlow ? "Authorize" : "Continue"}
          </span>
        ) : isAuthorizeFlow ? (
          "Authorize"
        ) : (
          "Continue"
        )}
      </Button>

      <Dialog open={sourceSheetOpen} onOpenChange={setSourceSheetOpen}>
        <DialogContent
          className="fixed bottom-0 left-0 right-0 top-auto max-h-[85vh] rounded-t-2xl border-t p-0 sm:max-w-lg sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border"
          showCloseButton={true}
        >
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>How would you like to send?</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="space-y-4 px-4 pb-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">From Balance</p>
                <div className="space-y-1">
                  {sourceAccounts.map((acc) => {
                    const sufficient = acc.availableBalance >= balanceDebitAmount
                    const isSelected =
                      paymentMethod === "balance" && sourceAccountId === acc.id
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setPaymentMethod("balance")
                          setSourceAccountId(acc.id)
                          setOtherCurrency(null)
                          setOtherPaymentMethod(null)
                          if (sufficient) setSourceSheetOpen(false)
                        }}
                        disabled={!sufficient}
                        className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected ? "bg-muted" : ""
                        }`}
                      >
                        <CurrencyFlag currency={acc.currency} size={24} className="shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{acc.currency} Balance</p>
                          <p className={`text-sm ${sufficient ? "text-muted-foreground" : "text-destructive"}`}>
                            {getCurrencySymbol(acc.currency)}
                            {acc.availableBalance.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-primary shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {showManualSendPaymentOptions ? (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Through Another Currency</p>
                {!otherCurrency ? (
                  <div className="space-y-1">
                    {otherCurrencies.map((currency) => (
                      <button
                        key={currency.code}
                        type="button"
                        onClick={() => {
                          setPaymentMethod("otherCurrency")
                          setOtherCurrency(currency.code)
                          setSourceAccountId(null)
                          setOtherPaymentMethod(null)
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <CurrencyFlag currency={currency.code} size={24} className="shrink-0" />
                          <p className="font-medium">{currency.name}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOtherCurrency(null)
                        setOtherPaymentMethod(null)
                        setPaymentMethod("otherCurrency")
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <p className="font-medium">
                        {otherCurrencies.find((c) => c.code === otherCurrency)?.name}
                      </p>
                    </button>
                    {currencyPaymentMethods[otherCurrency]?.map((method) => {
                      const isSelected = otherPaymentMethod === method.code
                      return (
                        <button
                          key={method.code}
                          type="button"
                          onClick={() => {
                            setPaymentMethod("otherCurrency")
                            setSourceAccountId(null)
                            setOtherPaymentMethod(method.code)
                            setManualPaymentMethodId(method.code)
                            setSourceSheetOpen(false)
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                            isSelected ? "bg-muted" : ""
                          }`}
                        >
                          <PaymentMethodDisplayLogo
                            name={method.name}
                            type={method.type}
                            currency={otherCurrency}
                            displayLogoUrl={method.displayLogoUrl}
                          />
                          <p className="font-medium">{method.name}</p>
                          {isSelected && <Check className="h-5 w-5 text-primary shrink-0 ml-auto" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
