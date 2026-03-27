"use client"

import { useState } from "react"
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
import { mockAccounts, currencyRates, currencySymbols } from "@/lib/mock-data"
import { Repeat } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CurrencyFlag } from "@easner/shared"

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

interface FXConvertDialogProps {
  account: (typeof mockAccounts)[0]
}

export function FXConvertDialog({ account }: FXConvertDialogProps) {
  const fromCurrency = account.currency
  const [toCurrency, setToCurrency] = useState<string>(
    account.currency === "USD" ? "EUR" : "USD"
  )
  const [amountStr, setAmountStr] = useState("")

  const amountNum = parseAmountFromDisplay(amountStr)
  const rate = toCurrency && fromCurrency !== toCurrency
    ? currencyRates[toCurrency] / currencyRates[fromCurrency]
    : 0
  const result = amountNum * rate

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Repeat className="h-4 w-4" />
          Move
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move funds</DialogTitle>
          <DialogDescription>
            Move funds from this account to another currency account. This is a preview and does not execute a transfer yet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">
              Amount to move ({fromCurrency})
            </Label>
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
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select destination currency" />
              </SelectTrigger>
              <SelectContent>
                {mockAccounts
                  .filter((acc) => acc.currency !== fromCurrency)
                  .map((acc) => (
                    <SelectItem key={acc.id} value={acc.currency}>
                      <span className="flex items-center gap-2">
                        <CurrencyFlag currency={acc.currency} size={18} />
                        {acc.currency}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm text-muted-foreground">Rate</p>
            <p className="text-lg font-semibold">
              1 {fromCurrency} = {(currencyRates[toCurrency] / currencyRates[fromCurrency]).toFixed(4)} {toCurrency}
            </p>
            <p className="text-sm text-muted-foreground pt-2">Amount credited to destination</p>
            <p className="text-2xl font-bold">
              {currencySymbols[toCurrency]}
              {result.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <Button className="w-full" disabled={!amountStr || amountNum <= 0}>
            Move (Preview only)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
