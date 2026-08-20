"use client"

import { useEffect } from "react"
import { CurrencyFlag } from "@/components/flags"
import { warmWebCurrencyFlag } from "@easner/shared"
import { cn } from "@/lib/utils"

type CurrencyFlagCircleProps = {
  currency: string
  /** Diameter in px (mobile dashboard balance chips use 24–35). */
  size?: number
  className?: string
}

/**
 * Circular filled currency flag – matches mobile dashboard / send balance selectors
 * (`surfaceChromeCircle` + cover crop), not the default 3:2 web flag frame.
 */
export function CurrencyFlagCircle({ currency, size = 35, className }: CurrencyFlagCircleProps) {
  useEffect(() => {
    warmWebCurrencyFlag(currency)
  }, [currency])

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-muted/40",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <CurrencyFlag
        currency={currency}
        className="size-full min-h-0 min-w-0 rounded-full [&_img]:size-full [&_img]:rounded-full [&_img]:object-cover [&_img]:object-center"
        title={currency}
      />
    </span>
  )
}
