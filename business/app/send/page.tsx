"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SendRecipientPicker } from "@/components/send-recipient-picker"
import { getCurrencySymbol } from "@/lib/utils"
import { sendFlowReferenceUsdPerUnit } from "@/lib/send-flow-reference-rates"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import type { Beneficiary } from "@/lib/recipient-types"
import {
  otherCurrencies,
  currencyPaymentMethods,
  stablecoinOptions,
  type OtherCurrencyCode,
  type PaymentMethodCode,
} from "@/lib/send-payment-methods"
import {
  ChevronDown,
  Check,
  ChevronRight,
  ArrowLeft,
  ArrowUpDown,
  Landmark,
  Link2,
  AlertCircle,
  Coins,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { generateTransactionId } from "@/lib/transaction-id"
import { fetchReserveEasnerTransactionId } from "@/lib/reserve-easner-transaction-id"
import { isEasetagLedgerP2PEnabled } from "@/lib/ledger/easetag-transfer"
import { CurrencyFlag } from "@/components/flags"
import { useBusinessProfile } from "@/lib/use-business-profile"
import {
  TIER2_COMPLETE_PLACEHOLDER,
} from "@/lib/compliance-placeholders"
import {
  type SendFlowState,
  SEND_FLOW_STATE_KEY,
  persistSendFlowState,
} from "@/lib/send-flow-session"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"

function getConversionRate(fromCurrency: string, toCurrency: string): number {
  if (fromCurrency === toCurrency) return 1
  const fromPerUsd = 1 / (sendFlowReferenceUsdPerUnit[fromCurrency] ?? 1)
  const toPerUsd = 1 / (sendFlowReferenceUsdPerUnit[toCurrency] ?? 1)
  return toPerUsd / fromPerUsd
}

function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (fromCurrency === toCurrency) return amount
  const rate = getConversionRate(fromCurrency, toCurrency)
  return amount * rate
}

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
  const { tier1Complete } = useBusinessProfile()
  const { accountRows: sourceAccounts } = useBusinessAccountRows()
  const [recipient, setRecipient] = useState<Beneficiary | null>(null)
  const [amountStr, setAmountStr] = useState("")
  const [amountEntryMode, setAmountEntryMode] = useState<"receive" | "send">("receive")
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>("balance")
  const [otherCurrency, setOtherCurrency] = useState<OtherCurrencyCode | "STABLECOIN" | null>(null)
  const [otherPaymentMethod, setOtherPaymentMethod] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false)

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
      } catch {
        // ignore
      }
    }
  }, [])

  const enteredAmount = parseAmountFromDisplay(amountStr)
  const receiveCurrency = recipient?.currency ?? "USD"
  const sourceAccount = sourceAccounts.find((a) => a.id === sourceAccountId)

  const sendCurrency = useMemo(() => {
    if (paymentMethod === "balance" && sourceAccount) return sourceAccount.currency
    if (paymentMethod === "usdc" || paymentMethod === "usdt" || otherCurrency === "STABLECOIN")
      return "USD"
    if (otherCurrency) return otherCurrency
    return "USD"
  }, [paymentMethod, sourceAccount, otherCurrency])

  const receiveAmount = useMemo(() => {
    if (!recipient || enteredAmount <= 0) return 0
    if (receiveCurrency === sendCurrency) return enteredAmount
    return amountEntryMode === "receive"
      ? enteredAmount
      : convertAmount(enteredAmount, sendCurrency, receiveCurrency)
  }, [recipient, enteredAmount, receiveCurrency, sendCurrency, amountEntryMode])

  const sendAmount = useMemo(() => {
    if (!recipient || receiveAmount <= 0) return 0
    if (receiveCurrency === sendCurrency) return receiveAmount
    return amountEntryMode === "send"
      ? enteredAmount
      : convertAmount(receiveAmount, receiveCurrency, sendCurrency)
  }, [recipient, receiveAmount, receiveCurrency, sendCurrency, amountEntryMode, enteredAmount])

  const hasFx = receiveCurrency !== sendCurrency && receiveAmount > 0
  const forwardRate = hasFx ? getConversionRate(sendCurrency, receiveCurrency) : 1
  const reverseRate = hasFx ? getConversionRate(receiveCurrency, sendCurrency) : 1
  const rateDisplay = hasFx
    ? amountEntryMode === "receive"
      ? `1 ${sendCurrency} = ${forwardRate.toFixed(4)} ${receiveCurrency}`
      : `1 ${receiveCurrency} = ${reverseRate.toFixed(4)} ${sendCurrency}`
    : null

  const displayBalanceForSource =
    sourceAccount && paymentMethod === "balance"
      ? sourceAccount.availableBalance - (sendAmount > 0 ? sendAmount : 0)
      : 0

  const suggestedAccount = useMemo(() => {
    const usdAccount = sourceAccounts.find((a) => a.currency === "USD")
    if (!recipient || receiveAmount <= 0) return usdAccount ?? sourceAccounts[0]
    const matching = sourceAccounts.find(
      (a) => a.currency === receiveCurrency && a.availableBalance >= sendAmount
    )
    if (matching) return matching
    const sufficient = sourceAccounts.find((a) => a.availableBalance >= sendAmount)
    return sufficient ?? usdAccount ?? sourceAccounts[0]
  }, [recipient, receiveAmount, receiveCurrency, sendAmount, sourceAccounts])

  useEffect(() => {
    if (recipient && !sourceAccountId && paymentMethod === "balance" && suggestedAccount) {
      setSourceAccountId(suggestedAccount.id)
    }
  }, [recipient, sourceAccountId, paymentMethod, suggestedAccount])

  const isBalanceSource = paymentMethod === "balance"
  const isStablecoinSource = paymentMethod === "usdc" || paymentMethod === "usdt"
  const hasValidOtherCurrencySelection =
    (otherCurrency &&
      otherPaymentMethod &&
      (paymentMethod === "bankTransfer" ||
        paymentMethod === "mpesa" ||
        paymentMethod === "mtnMomo" ||
        paymentMethod === "sbp")) ||
    (otherCurrency === "STABLECOIN" && (paymentMethod === "usdc" || paymentMethod === "usdt"))
  const hasValidStablecoinSelection = isStablecoinSource

  const canContinueBalance =
    recipient !== null &&
    receiveAmount > 0 &&
    sourceAccountId !== null &&
    sourceAccount &&
    sourceAccount.availableBalance >= sendAmount &&
    isBalanceSource &&
    tier1Complete

  const canContinueStablecoin =
    recipient !== null && receiveAmount > 0 && hasValidStablecoinSelection && tier1Complete

  const canContinueOtherCurrency =
    recipient !== null &&
    receiveAmount > 0 &&
    hasValidOtherCurrencySelection &&
    TIER2_COMPLETE_PLACEHOLDER

  const canContinue =
    isBalanceSource
      ? canContinueBalance
      : isStablecoinSource
        ? canContinueStablecoin
        : canContinueOtherCurrency

  const isAuthorizeFlow = !isBalanceSource

  const hasInsufficientBalance =
    isBalanceSource &&
    sourceAccount &&
    receiveAmount > 0 &&
    sourceAccount.availableBalance < sendAmount

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
    if (paymentMethod === "usdc") return "Pay with USDC"
    if (paymentMethod === "usdt") return "Pay with USDT"
    if (otherCurrency && otherCurrency !== "STABLECOIN" && otherPaymentMethod) {
      const method = currencyPaymentMethods[otherCurrency]?.find(
        (m) => m.code === otherPaymentMethod
      )
      return `${otherCurrency} • ${method?.name ?? otherPaymentMethod}`
    }
    return "Select method"
  }

  const handleContinue = async () => {
    if (!canContinue || !recipient) return

    let transactionId = generateTransactionId()
    if (recipient.payeeEasetag?.trim() && isEasetagLedgerP2PEnabled()) {
      const reserved = await fetchReserveEasnerTransactionId()
      if (!reserved.ok) {
        window.alert(
          reserved.error === "reserve_failed" || reserved.error === "Unauthorized"
            ? "Could not reserve transaction reference. Sign in and try again."
            : `Could not reserve transaction reference: ${reserved.error}`,
        )
        return
      }
      transactionId = reserved.easner_transaction_id
    }

    const state: SendFlowState = {
      recipient: coerceBeneficiaryEasenetDisplay(recipient),
      amount: receiveAmount,
      receiveCurrency,
      sendAmount,
      sendCurrency,
      sourceAccountId: sourceAccount?.id,
      paymentMethod,
      otherCurrency: otherCurrency ?? undefined,
      otherPaymentMethod: otherPaymentMethod ?? undefined,
      note: note.trim(),
      transactionId,
    }
    persistSendFlowState(state)

    if (isBalanceSource) {
      router.push("/send/confirm")
      return
    }

    if (otherPaymentMethod === "sbp") {
      router.push("/send/authorize/open-banking")
      return
    }
    if (otherPaymentMethod === "bankTransfer") {
      router.push("/send/authorize/bank-transfer")
      return
    }
    if (otherPaymentMethod === "mpesa" || otherPaymentMethod === "mtnMomo") {
      router.push("/send/authorize/mobile-money")
      return
    }
    if (paymentMethod === "usdc" || paymentMethod === "usdt") {
      router.push("/send/authorize/stablecoin")
      return
    }

    router.push("/send/confirm")
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
            {receiveCurrency !== sendCurrency ? (
              <div className="flex min-w-0 flex-1 items-center justify-end text-sm text-muted-foreground">
                {hasFx && rateDisplay ? (
                  <div className="flex max-w-full items-center justify-end gap-x-1 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={handleToggleAmountDirection}
                      className="inline-flex min-w-0 max-w-full items-center gap-1 hover:text-foreground"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                      <span className="min-w-0 truncate">
                        {amountEntryMode === "receive" ? "Sending" : "Receiving"}:{" "}
                        {getCurrencySymbol(amountEntryMode === "receive" ? sendCurrency : receiveCurrency)}
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
              {getCurrencySymbol(amountInputCurrency)}
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
                  <CurrencyFlag currency={sourceAccount.currency} size={22} className="rounded-sm" />
                ) : paymentMethod === "usdc" || paymentMethod === "usdt" ? (
                  <Coins className="h-5 w-5" />
                ) : otherCurrency === "STABLECOIN" ? (
                  <Coins className="h-5 w-5" />
                ) : otherCurrency ? (
                  <CurrencyFlag currency={otherCurrency} size={22} className="rounded-sm" />
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

      {recipient && (
        <div className="space-y-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Input
            id="note"
            placeholder="Add a note for this transfer"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11"
          />
        </div>
      )}

      <Button
        size="lg"
        className="w-full h-12"
        disabled={!canContinue}
        onClick={handleContinue}
      >
        {isAuthorizeFlow ? "Authorize" : "Continue"}
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
                    const sufficient = acc.availableBalance >= sendAmount
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
                        <CurrencyFlag currency={acc.currency} size={24} className="rounded-sm" />
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

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Through Another Currency</p>
                {!otherCurrency ? (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod("otherCurrency")
                        setOtherCurrency("STABLECOIN")
                        setSourceAccountId(null)
                        setOtherPaymentMethod(null)
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Coins className="h-5 w-5 shrink-0" />
                        <p className="font-medium">Stablecoin</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
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
                          <CurrencyFlag currency={currency.code} size={24} className="rounded-sm" />
                          <p className="font-medium">{currency.name}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                ) : otherCurrency === "STABLECOIN" ? (
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
                      <p className="font-medium">Stablecoin</p>
                    </button>
                    {stablecoinOptions.map((opt) => {
                      const isSelected = paymentMethod === opt.code
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => {
                            setPaymentMethod(opt.code as PaymentMethodCode)
                            setSourceAccountId(null)
                            setOtherCurrency("STABLECOIN")
                            setOtherPaymentMethod(opt.code)
                            setSourceSheetOpen(false)
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                            isSelected ? "bg-muted" : ""
                          }`}
                        >
                          <img
                            src={
                              opt.code === "usdc"
                                ? "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png"
                                : "https://assets.coingecko.com/coins/images/325/small/Tether.png"
                            }
                            alt={opt.name}
                            className="h-8 w-8 rounded-full shrink-0"
                          />
                          <p className="font-medium">{opt.name}</p>
                          {isSelected && <Check className="h-5 w-5 text-primary shrink-0 ml-auto" />}
                        </button>
                      )
                    })}
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
                    {currencyPaymentMethods[otherCurrency as OtherCurrencyCode]?.map((method) => {
                      const isSelected = otherPaymentMethod === method.code
                      const icon =
                        method.code === "bankTransfer" ? (
                          <Landmark className="h-5 w-5" />
                        ) : method.code === "sbp" ? (
                          <Link2 className="h-5 w-5" />
                        ) : (
                          <span className="text-lg">📱</span>
                        )
                      return (
                        <button
                          key={method.code}
                          type="button"
                          onClick={() => {
                            setPaymentMethod(method.code as PaymentMethodCode)
                            setSourceAccountId(null)
                            setOtherPaymentMethod(method.code)
                            setSourceSheetOpen(false)
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                            isSelected ? "bg-muted" : ""
                          }`}
                        >
                          <span className="flex h-8 w-8 items-center justify-center shrink-0">
                            {icon}
                          </span>
                          <p className="font-medium">{method.name}</p>
                          {isSelected && <Check className="h-5 w-5 text-primary shrink-0 ml-auto" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
