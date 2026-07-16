"use client"

import { CurrencyFlagCircle } from "@/components/currency-flag-circle"

type Props = {
  label: string
  currency: string
  balanceLabel: string
  flagSize?: number
}

export function CreditDestinationRow({
  label,
  currency,
  balanceLabel,
  flagSize = 22,
}: Props) {
  return (
    <div className="flex items-center justify-between border-b pb-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex shrink-0 items-center gap-2 font-medium whitespace-nowrap">
        <CurrencyFlagCircle currency={currency} size={flagSize} />
        <span className="whitespace-nowrap">{balanceLabel}</span>
      </div>
    </div>
  )
}
