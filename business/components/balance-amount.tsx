"use client"

import { useEffect, useRef, useState } from "react"
import { cn, getSendAmountFieldSymbol } from "@/lib/utils"

/** Shown instead of the figure when balances are hidden. */
export const BALANCE_MASK = "••••••"

export type BalanceParts = {
  sign: string
  symbol: string
  /** Whole units with grouping, e.g. "24,190". */
  major: string
  /** Separator and cents, e.g. ".32". */
  minor: string
  text: string
}

/** Split a balance into symbol, whole units and cents. Balances always show two decimals. */
export function splitBalance(amount: number, currency: string): BalanceParts {
  const value = Number.isFinite(amount) ? amount : 0
  const sign = value < 0 ? "−" : ""
  // Pegged stablecoins show their fiat symbol (USDC → $, EURC → €).
  const symbol = getSendAmountFieldSymbol(currency)
  const fixed = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dot = fixed.lastIndexOf(".")
  const major = dot === -1 ? fixed : fixed.slice(0, dot)
  const minor = dot === -1 ? "" : fixed.slice(dot)
  return { sign, symbol, major, minor, text: `${sign}${symbol}${major}${minor}` }
}

type Size = "hero" | "display"

/** Step the type down as whole-unit digits grow so long balances stay on one line. */
export function balanceSizeClass(parts: BalanceParts, size: Size): string {
  const digits = parts.major.replace(/[^0-9]/g, "").length
  if (size === "hero") {
    if (digits <= 6) return "text-4xl sm:text-5xl lg:text-6xl"
    if (digits <= 9) return "text-3xl sm:text-4xl lg:text-5xl"
    return "text-2xl sm:text-3xl lg:text-4xl"
  }
  if (digits <= 6) return "text-[2rem]"
  if (digits <= 9) return "text-[1.75rem]"
  return "text-2xl"
}

type Props = {
  amount: number
  currency: string
  hidden?: boolean
  size?: Size
  className?: string
  /** Roll to the new value when it changes after first render. Defaults to true. */
  animate?: boolean
}

/**
 * A balance with cents at 60% of the whole units, sized down for long values,
 * rolling up (increase) or down (decrease) when it changes on screen.
 */
export function BalanceAmount({ amount, currency, hidden = false, size = "hero", className, animate = true }: Props) {
  const parts = splitBalance(amount, currency)
  const key = hidden ? "mask" : parts.text
  const prev = useRef<{ key: string; amount: number } | null>(null)
  const [roll, setRoll] = useState<"up" | "down" | "fade" | null>(null)

  useEffect(() => {
    const last = prev.current
    prev.current = { key, amount }
    if (!animate || !last || last.key === key) return
    if (last.key === "mask" || key === "mask") setRoll("fade")
    else setRoll(amount >= last.amount ? "up" : "down")
  }, [key, amount, animate])

  return (
    <span
      className={cn("inline-flex overflow-hidden leading-none tabular-nums", balanceSizeClass(parts, size), className)}
      aria-label={hidden ? "Balance hidden" : parts.text}
    >
      <span
        key={key}
        aria-hidden
        className={cn(
          "inline-block motion-reduce:animate-none",
          roll === "up" && "animate-in fade-in slide-in-from-bottom-4 duration-300",
          roll === "down" && "animate-in fade-in slide-in-from-top-4 duration-300",
          roll === "fade" && "animate-in fade-in duration-150",
        )}
      >
        {hidden ? (
          <span className="tracking-[0.12em]">{BALANCE_MASK}</span>
        ) : (
          <>
            {parts.sign}
            {parts.symbol}
            {parts.major}
            {parts.minor ? <span className="text-[0.6em] font-semibold tracking-normal">{parts.minor}</span> : null}
          </>
        )}
      </span>
    </span>
  )
}
