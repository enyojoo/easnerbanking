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
  resolveMoveQuoteRate,
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

function roundMoneyAmount(amount: number): number {
  return Math.round(amount * 100) / 100
}

function quoteMatchesAmount(
  quote: MoveQuoteState | null | undefined,
  enteredAmount: number,
): boolean {
  if (!quote) return false
  return Math.abs(quote.sourceAmount - enteredAmount) < 0.005
}

type Props = {
  direction: "usd_to_eur" | "eur_to_usd"
  onDirectionChange: (direction: "usd_to_eur" | "eur_to_usd") => void
  sourceAccount: Account
  destAccount: Account
  amountStr: string
  onAmountStrChange: (value: string) => void
  quote: MoveQuoteState | null
  indicativeRate: number | null
  quoteRateLoading: boolean
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
  indicativeRate,
  quoteRateLoading,
  quoteLoading,
  quoteError,
  onContinue,
  continueDisabled,
  continueLoading,
}: Props) {
  const sourceCurrency = sourceCurrencyForDirection(direction)
  const destCurrency = destCurrencyForDirection(direction)
  const enteredAmount = parseAmountFromDisplay(amountStr)
  const matchedQuote = quoteMatchesAmount(quote, enteredAmount) ? quote : null
  const debitAmount = matchedQuote?.totalDebited ?? enteredAmount
  const hasInsufficientBalance =
    enteredAmount > 0 && debitAmount > sourceAccount.availableBalance
  const shortfallAmount = Math.max(0, debitAmount - sourceAccount.availableBalance)

  const forwardRate = matchedQuote
    ? resolveMoveQuoteRate(matchedQuote)
    : indicativeRate && indicativeRate > 0
      ? indicativeRate
      : 0
  const receiveAmount =
    matchedQuote && matchedQuote.destinationAmount > 0
      ? matchedQuote.destinationAmount
      : forwardRate > 0 && enteredAmount > 0
        ? roundMoneyAmount(enteredAmount * forwardRate)
        : 0

  const hasFx = enteredAmount > 0 && receiveAmount > 0
  const rateDisplay = hasFx ? formatSendRateLabel(sourceCurrency, destCurrency, forwardRate) : null
  const receivingPreview = hasFx ? formatMoneyDisplay(receiveAmount, destCurrency) : null

  const minAmountError =
    quoteError === "min_amount_not_met"
      ? `Minimum move amount is ${formatMoneyDisplay(BALANCE_CONVERT_MIN_SOURCE_AMOUNT, sourceCurrency)}.`
      : null

  const showQuoteUnavailable =
    enteredAmount > 0 &&
    !quoteRateLoading &&
    !quoteLoading &&
    !rateDisplay &&
    quoteError &&
    quoteError !== "min_amount_not_met" &&
    quoteError !== "relay_not_configured"

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
        <div className="flex min-h-[2.5rem] items-center justify-between gap-3">
          <p className="mb-0 shrink-0 text-sm font-medium leading-none text-muted-foreground">
            Amount ({sourceCurrency})
          </p>
          <div className="flex min-w-0 flex-1 items-center justify-end text-sm text-muted-foreground">
            {quoteRateLoading ? (
              <Skeleton className="h-4 w-52 max-w-full" />
            ) : showQuoteUnavailable ? (
              <span className="text-xs text-destructive">
                Exchange rate unavailable. Try again shortly.
              </span>
            ) : hasFx && rateDisplay ? (
              <div className="flex max-w-full flex-col items-end gap-0.5 text-sm text-muted-foreground">
                <div className="flex max-w-full items-center justify-end gap-x-1 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onDirectionChange(oppositeMoveDirection(direction))}
                    className="inline-flex min-w-0 max-w-full items-center gap-1 hover:text-foreground"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                    <span className="min-w-0 truncate">Receiving: {receivingPreview}</span>
                  </button>
                  <span className="shrink-0">• Rate: {rateDisplay}</span>
                </div>
              </div>
            ) : (
              <span className="pointer-events-none select-none text-sm leading-none opacity-0" aria-hidden>
                .
              </span>
            )}
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

        {quoteError === "relay_not_configured" ? (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Balance moves are temporarily unavailable. Try again later.</span>
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
