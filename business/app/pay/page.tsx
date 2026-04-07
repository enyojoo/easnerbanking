"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AmountKeypad } from "@/components/app-lock/amount-keypad"
import { formatAmountForDisplay, parseAmountFromDisplay } from "@/lib/amount-display"
import { getCurrencySymbol } from "@/lib/utils"
import {
  isTerminalChargeFiatSupported,
  TERMINAL_CHARGE_FIAT_CODES,
} from "@/lib/noah/terminal-charge-fiats"
import { resolveTerminalPayFiatCurrency } from "@/lib/noah/terminal-pay-fiat"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { ArrowRight } from "lucide-react"

const PAY_AMOUNT_KEY = "easner_terminal_pay_amount"
const PAY_CHARGE_FIAT_KEY = "easner_terminal_pay_charge_fiat"

function defaultChargeFiatFromProfile(baseCurrency: string | null | undefined): string {
  const u = (baseCurrency || "").trim().toUpperCase()
  if (u && isTerminalChargeFiatSupported(u)) return u
  return resolveTerminalPayFiatCurrency(baseCurrency)
}

export default function PayAmountPage() {
  const router = useRouter()
  const { tier1Complete, baseCurrency } = useBusinessProfile()
  const chargeFiatInit = useRef(false)
  const [chargeFiat, setChargeFiat] = useState("USD")
  const [amountStr, setAmountStr] = useState(() => {
    if (typeof window === "undefined") return ""
    try {
      return sessionStorage.getItem(PAY_AMOUNT_KEY) || ""
    } catch {
      return ""
    }
  })

  useEffect(() => {
    if (chargeFiatInit.current) return
    chargeFiatInit.current = true
    try {
      const s = sessionStorage.getItem(PAY_CHARGE_FIAT_KEY)
      if (s && isTerminalChargeFiatSupported(s)) {
        setChargeFiat(s.trim().toUpperCase())
        return
      }
    } catch {
      // ignore
    }
    setChargeFiat(defaultChargeFiatFromProfile(baseCurrency))
  }, [baseCurrency])

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
  const displaySymbol = getCurrencySymbol(chargeFiat)

  const onContinue = () => {
    if (!tier1Complete) return
    if (!(fiatAmount > 0)) return
    try {
      sessionStorage.setItem(PAY_AMOUNT_KEY, amountStr)
      sessionStorage.setItem(PAY_CHARGE_FIAT_KEY, chargeFiat)
    } catch {
      // ignore
    }
    const q = new URLSearchParams({
      amount: fiatAmount.toFixed(2),
      fiat_currency: chargeFiat,
    })
    router.push(`/pay/asset?${q.toString()}`)
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="text-sm font-medium text-foreground" htmlFor="pay-charge-currency">
          Charge currency
        </label>
        <Select
          value={chargeFiat}
          onValueChange={(v) => setChargeFiat(v.toUpperCase())}
        >
          <SelectTrigger id="pay-charge-currency" className="w-full sm:w-[min(100%,220px)]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TERMINAL_CHARGE_FIAT_CODES.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className="box-border flex h-[88px] shrink-0 items-center justify-center gap-0.5 rounded-xl border-2 border-input bg-background px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 sm:h-[100px] sm:px-6"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        <span className="shrink-0 select-none text-4xl font-black text-foreground sm:text-5xl">
          {displaySymbol}
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
          aria-label={`Charge amount in ${chargeFiat}`}
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
