"use client"

import { AlertCircle, ArrowUpDown } from "lucide-react"
import {
  BALANCE_CONVERT_MIN_SOURCE_AMOUNT,
  formatMoneyDisplay,
  formatSendRateLabel,
} from "@easner/shared"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getCurrencySymbol } from "@/lib/utils"
import type { MoveQuoteState } from "@/lib/move-quote-state"
import {
  destCurrencyForDirection,
  oppositeMoveDirection,
  sourceCurrencyForDirection,
} from "@/lib/move-quote-state"
import type { Account } from "@/lib/finance-types"

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

type Props = {
  direction: "usd_to_eur" | "eur_to_usd"
  onDirectionChange: (direction: "usd_to_eur" | "eur_to_usd") => void
  sourceAccount: Account
  destAccount: Account
  amountStr: string
  onAmountStrChange: (value: string) => void
  quote: MoveQuoteState | null
  quoteLoading: boolean
  quoteError: string | null
  onContinue: () => void
  continueDisabled: boolean
  continueLoading?: boolean
}

function balanceRowLabel(currency: string): string {
  return `${currency} Balance`
}

export function MoveAmountStep({
  direction,
  onDirectionChange,
  sourceAccount,
  destAccount,
  amountStr,
  onAmountStrChange,
  quote,
  quoteLoading,
  quoteError,
  onContinue,
  continueDisabled,
  continueLoading,
}: Props) {
  const sourceCurrency = sourceCurrencyForDirection(direction)
  const destCurrency = destCurrencyForDirection(direction)
  const enteredAmount = parseAmountFromDisplay(amountStr)
  const debitAmount = quote?.totalDebited ?? enteredAmount
  const hasInsufficientBalance =
    enteredAmount > 0 && debitAmount > sourceAccount.availableBalance
  const shortfallAmount = Math.max(0, debitAmount - sourceAccount.availableBalance)
  const rateDisplay =
    quote && quote.rate > 0 ? formatSendRateLabel(sourceCurrency, destCurrency, quote.rate) : null
  const receivingPreview =
    quote && quote.destinationAmount > 0
      ? formatMoneyDisplay(quote.destinationAmount, destCurrency)
      : null

  const minAmountError =
    quoteError === "min_amount_not_met"
      ? `Minimum move amount is ${formatMoneyDisplay(BALANCE_CONVERT_MIN_SOURCE_AMOUNT, sourceCurrency)}.`
      : null

  const relayError =
    quoteError === "relay_not_configured"
      ? "Balance moves are temporarily unavailable. Try again later."
      : null

  const genericQuoteError =
    quoteError && quoteError !== "min_amount_not_met" && quoteError !== "relay_not_configured"
      ? "Unable to fetch an exchange rate. Check the amount and try again."
      : null

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Moving from
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CurrencyFlagCircle currency={sourceCurrency} size={28} />
            <div>
              <p className="text-sm font-semibold text-foreground">{balanceRowLabel(sourceCurrency)}</p>
              <p className="text-xs text-muted-foreground">
                Available{" "}
                {formatMoneyDisplay(sourceAccount.availableBalance, sourceCurrency)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">Amount ({sourceCurrency})</p>
          <div className="flex min-w-0 flex-1 items-center justify-end text-sm text-muted-foreground">
            {quoteLoading ? (
              <Skeleton className="h-4 w-48 max-w-full" />
            ) : receivingPreview && rateDisplay ? (
              <button
                type="button"
                onClick={() => onDirectionChange(oppositeMoveDirection(direction))}
                className="inline-flex max-w-full items-center gap-1 hover:text-foreground"
              >
                <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                <span className="min-w-0 truncate">
                  Receiving: {receivingPreview}
                </span>
                <span className="shrink-0">• Rate: {rateDisplay}</span>
              </button>
            ) : null}
          </div>
        </div>

        <div
          className="flex h-[88px] shrink-0 items-center justify-center rounded-xl border-2 border-input bg-background px-6 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          <span className="shrink-0 select-none text-4xl font-black text-foreground">
            {getCurrencySymbol(sourceCurrency)}
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
              onAmountStrChange(formatAmountForDisplay(v))
            }}
            className="w-full min-w-0 border-0 bg-transparent text-4xl font-black text-foreground outline-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
          />
        </div>

        {hasInsufficientBalance ? (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Insufficient {sourceCurrency} balance. You need{" "}
              {formatMoneyDisplay(shortfallAmount, sourceCurrency)} more.
            </span>
          </div>
        ) : null}

        {minAmountError ? (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{minAmountError}</span>
          </div>
        ) : null}

        {relayError || genericQuoteError ? (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{relayError ?? genericQuoteError}</span>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Moving to
        </p>
        <div className="mt-2 flex items-center gap-2">
          <CurrencyFlagCircle currency={destCurrency} size={28} />
          <div>
            <p className="text-sm font-semibold text-foreground">{balanceRowLabel(destCurrency)}</p>
            <p className="text-xs text-muted-foreground">
              Available {formatMoneyDisplay(destAccount.availableBalance, destCurrency)}
            </p>
          </div>
        </div>
      </div>

      <Button
        className="w-full"
        size="lg"
        disabled={continueDisabled}
        onClick={onContinue}
      >
        {continueLoading ? "Loading…" : "Continue"}
      </Button>
    </div>
  )
}
