"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { Account } from "@/lib/mock-data"
import { currencySymbols } from "@/lib/mock-data"
import { Repeat } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CurrencyFlag } from "@/components/flags"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { Loader2 } from "lucide-react"

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

type QuoteJson = {
  sourceCurrency?: string
  destinationCurrency?: string
  destinationAmount?: string
  impliedRate?: number
  error?: string
}

interface FXConvertDialogProps {
  account: Account
  /** Currencies user can move into (e.g. other account rows). Only USD/EUR get live Noah quotes. */
  destinationCurrencies: string[]
  tier1Complete: boolean
  noahScopeHeader: Record<string, string>
  onAfterMove?: () => void
}

export function FXConvertDialog({
  account,
  destinationCurrencies,
  tier1Complete,
  noahScopeHeader,
  onAfterMove,
}: FXConvertDialogProps) {
  const fromCurrency = account.currency
  const fiatDestinations = useMemo(
    () =>
      destinationCurrencies.filter(
        (c) => c !== fromCurrency && (c === "USD" || c === "EUR"),
      ),
    [destinationCurrencies, fromCurrency],
  )

  const [toCurrency, setToCurrency] = useState<string>(() => fiatDestinations[0] ?? "")
  const [amountStr, setAmountStr] = useState("")
  const [quote, setQuote] = useState<QuoteJson | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [moveLoading, setMoveLoading] = useState(false)

  useEffect(() => {
    if (toCurrency && !fiatDestinations.includes(toCurrency)) {
      setToCurrency(fiatDestinations[0] ?? "")
    }
  }, [fiatDestinations, toCurrency])

  const amountNum = parseAmountFromDisplay(amountStr)

  const fetchQuote = useCallback(async () => {
    if (!tier1Complete || !toCurrency || amountNum <= 0) {
      setQuote(null)
      setQuoteError(null)
      return
    }
    setQuoteLoading(true)
    setQuoteError(null)
    try {
      const qs = new URLSearchParams({
        sourceCurrency: fromCurrency,
        destinationCurrency: toCurrency,
        sourceAmount: String(amountNum),
      })
      const res = await fetchWithSession(`/api/noah/prices?${qs.toString()}`, {
        headers: { ...noahScopeHeader },
      })
      const data = (await res.json()) as QuoteJson
      if (!res.ok) {
        throw new Error(data.error || "Quote failed")
      }
      setQuote(data)
    } catch (e: unknown) {
      setQuote(null)
      setQuoteError(e instanceof Error ? e.message : "Quote failed")
    } finally {
      setQuoteLoading(false)
    }
  }, [tier1Complete, fromCurrency, toCurrency, amountNum, noahScopeHeader])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchQuote()
    }, 450)
    return () => window.clearTimeout(t)
  }, [fetchQuote])

  const destAmountDisplay = quote?.destinationAmount
  const rateDisplay =
    quote?.impliedRate != null && Number.isFinite(quote.impliedRate)
      ? quote.impliedRate.toFixed(6)
      : null

  const onMove = async () => {
    setMoveLoading(true)
    try {
      const res = await fetchWithSession("/api/noah/fx/convert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...noahScopeHeader,
        },
        body: JSON.stringify({
          sourceCurrency: fromCurrency,
          destinationCurrency: toCurrency,
          sourceAmount: String(amountNum),
        }),
      })
      if (res.status === 501) {
        setQuoteError("Move is not available yet — execution is still being connected to Noah.")
        return
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || "Move failed")
      }
      onAfterMove?.()
    } catch (e: unknown) {
      setQuoteError(e instanceof Error ? e.message : "Move failed")
    } finally {
      setMoveLoading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" disabled={!tier1Complete}>
          <Repeat className="h-4 w-4" />
          Move
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move funds</DialogTitle>
          <DialogDescription>
            Convert between your USD and EUR balances (stablecoin-backed). Quotes use Noah&apos;s live rates.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Amount to move ({fromCurrency})</Label>
            <div
              className="flex items-center justify-center min-h-[88px] py-5 px-5 rounded-xl border-2 border-input bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-colors gap-0.5"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <span className="font-black text-foreground select-none shrink-0 text-4xl">
                {currencySymbols[fromCurrency] ?? fromCurrency}
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
                className="w-full min-w-0 bg-transparent border-0 outline-none font-black text-foreground text-4xl placeholder:text-muted-foreground/50 focus:ring-0 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">To account currency</Label>
            <Select
              value={toCurrency === fromCurrency ? "" : toCurrency}
              onValueChange={setToCurrency}
              disabled={fiatDestinations.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select destination currency" />
              </SelectTrigger>
              <SelectContent>
                {fiatDestinations.map((cur) => (
                  <SelectItem key={cur} value={cur}>
                    <span className="flex items-center gap-2">
                      <CurrencyFlag currency={cur} size={18} />
                      {cur}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fiatDestinations.length === 0 ? (
              <p className="text-xs text-muted-foreground">Open another currency account to move funds.</p>
            ) : null}
          </div>
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm text-muted-foreground">Rate (indicative)</p>
            {quoteLoading ? (
              <p className="text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Getting quote…
              </p>
            ) : rateDisplay && toCurrency ? (
              <p className="text-lg font-semibold">
                1 {fromCurrency} ≈ {rateDisplay} {toCurrency}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Enter an amount to see a live quote.</p>
            )}
            <p className="text-sm text-muted-foreground pt-2">Estimated amount credited</p>
            <p className="text-2xl font-bold">
              {toCurrency ? currencySymbols[toCurrency] : ""}
              {destAmountDisplay
                ? Number.parseFloat(destAmountDisplay).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </p>
            {quoteError ? <p className="text-sm text-destructive">{quoteError}</p> : null}
          </div>
          <Button
            className="w-full"
            disabled={!tier1Complete || !amountStr || amountNum <= 0 || !toCurrency || moveLoading}
            onClick={() => void onMove()}
          >
            {moveLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Move…
              </>
            ) : (
              "Move"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
