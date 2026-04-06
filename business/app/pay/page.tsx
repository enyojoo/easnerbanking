"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { AmountKeypad } from "@/components/app-lock/amount-keypad"
import { formatAmountForDisplay, parseAmountFromDisplay } from "@/lib/amount-display"
import { resolveTerminalPayFiatCurrency } from "@/lib/noah/terminal-pay-fiat"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { currencySymbols } from "@/lib/currency-meta"
import { ArrowRight } from "lucide-react"

const PAY_AMOUNT_KEY = "easner_terminal_pay_amount"

export default function PayAmountPage() {
  const router = useRouter()
  const { tier1Complete, baseCurrency } = useBusinessProfile()
  /** Counter charge fiat (USD/EUR vs Noah wallets). Bank payout uses Setup payout on /terminal. */
  const chargeFiatCurrency = resolveTerminalPayFiatCurrency(baseCurrency)
  const [amountStr, setAmountStr] = useState(() => {
    if (typeof window === "undefined") return ""
    try {
      return sessionStorage.getItem(PAY_AMOUNT_KEY) || ""
    } catch {
      return ""
    }
  })

  const appendDigit = useCallback((d: string) => {
    setAmountStr((prev) => formatAmountForDisplay(prev + d))
  }, [])

  const appendDecimal = useCallback(() => {
    setAmountStr((prev) => {
      if (prev.includes(".")) return prev
      return prev ? `${prev}.` : "0."
    })
  }, [])

  const backspace = useCallback(() => {
    setAmountStr((prev) => {
      const next = prev.slice(0, -1)
      return formatAmountForDisplay(next)
    })
  }, [])

  const fiatAmount = parseAmountFromDisplay(amountStr)

  const onContinue = () => {
    if (!tier1Complete) return
    if (!(fiatAmount > 0)) return
    try {
      sessionStorage.setItem(PAY_AMOUNT_KEY, amountStr)
    } catch {
      // ignore
    }
    router.push(`/pay/asset?amount=${encodeURIComponent(fiatAmount.toFixed(2))}`)
  }

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-6">
      <div className="mt-4 sm:mt-6">
        <h1 className="text-3xl font-bold leading-none tracking-tight sm:text-4xl md:text-[2.5rem]">
          Charge amount
        </h1>
        <p className="mt-3 text-lg leading-snug text-muted-foreground sm:mt-2 sm:text-xl">
          Enter the total the customer should pay.
        </p>
      </div>

      <div
        className="box-border flex h-[88px] shrink-0 items-center justify-center gap-0.5 rounded-xl border-2 border-input bg-background px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 sm:h-[100px] sm:px-6"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        <span className="shrink-0 select-none text-4xl font-black text-foreground sm:text-5xl">
          {currencySymbols[chargeFiatCurrency] ?? chargeFiatCurrency}
        </span>
        <input
          id="pay-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amountStr}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "")
            const parts = v.split(".")
            if (parts.length > 2) return
            if (parts[1] && parts[1].length > 2) return
            setAmountStr(formatAmountForDisplay(v))
          }}
          className="min-w-0 w-full border-0 bg-transparent text-4xl font-black text-foreground outline-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 sm:text-5xl [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={`Charge amount in ${chargeFiatCurrency}`}
        />
      </div>

      <AmountKeypad onDigit={appendDigit} onDecimal={appendDecimal} onBackspace={backspace} />

      <Button
        type="button"
        className="h-12 w-full gap-2 touch-manipulation"
        disabled={!tier1Complete || !(fiatAmount > 0)}
        onClick={onContinue}
      >
        Continue
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  )
}
