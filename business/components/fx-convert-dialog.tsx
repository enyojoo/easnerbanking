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
import { Input } from "@/components/ui/input"
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

const currencyFlags: Record<string, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  NGN: "🇳🇬",
}

interface FXConvertDialogProps {
  account: (typeof mockAccounts)[0]
}

export function FXConvertDialog({ account }: FXConvertDialogProps) {
  const fromCurrency = account.currency
  const [toCurrency, setToCurrency] = useState<string>(
    account.currency === "USD" ? "EUR" : "USD"
  )
  const [amount, setAmount] = useState("")

  const amountNum = parseFloat(amount) || 0
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
            <Label>From</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
              {currencyFlags[fromCurrency]} {fromCurrency} account (auto-selected)
            </div>
          </div>
          <div className="space-y-2">
            <Label>To account currency</Label>
            <Select
              value={toCurrency === fromCurrency ? "" : toCurrency}
              onValueChange={setToCurrency}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select destination currency" />
              </SelectTrigger>
              <SelectContent>
                {mockAccounts
                  .filter((acc) => acc.currency !== fromCurrency)
                  .map((acc) => (
                    <SelectItem key={acc.id} value={acc.currency}>
                      {currencyFlags[acc.currency]} {acc.currency}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount to move ({fromCurrency})</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm text-muted-foreground">Rate</p>
            <p className="text-lg font-semibold">
              1 {fromCurrency} = {(currencyRates[toCurrency] / currencyRates[fromCurrency]).toFixed(4)} {toCurrency}
            </p>
            <p className="text-sm text-muted-foreground pt-2">Amount deducted from source</p>
            <p className="text-lg font-semibold">
              {currencySymbols[fromCurrency]}
              {amountNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {fromCurrency}
            </p>
            <p className="text-sm text-muted-foreground pt-2">Amount credited to destination</p>
            <p className="text-2xl font-bold">
              {currencySymbols[toCurrency]}
              {result.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {toCurrency}
            </p>
          </div>
          <Button className="w-full" disabled={!amount || amountNum <= 0}>
            Move (Preview only)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
