"use client"

import type { ReactNode } from "react"
import { CurrencyFlag } from "@/components/flags"
import { cn } from "@/lib/utils"

type Props = {
  code: string
  size?: number
  className?: string
  /** Extra hint (e.g. legacy “not in allowed list”) */
  suffix?: ReactNode
}

/** Flag and uppercase code — used in base currency Select items and trigger via Radix ItemText. */
export function BaseCurrencyOptionLabel({ code, size = 20, className, suffix }: Props) {
  const upper = String(code || "").trim().toUpperCase()
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <CurrencyFlag currency={upper} size={size} className="shrink-0 rounded-sm" />
      <span className="tabular-nums">{upper}</span>
      {suffix}
    </span>
  )
}
