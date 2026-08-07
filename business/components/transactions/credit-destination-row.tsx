"use client"

import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { cn } from "@/lib/utils"
import { transactionDetailRowClassName } from "@/components/transactions/transaction-detail-summary-row"

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
  const resolvedBalanceLabel =
    String(balanceLabel ?? "").trim() ||
    (currency ? `${String(currency).trim().toUpperCase()} Balance` : "Balance")

  return (
    <div className={cn(transactionDetailRowClassName, "items-center")}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 max-w-[72%] shrink items-center justify-end gap-2 whitespace-nowrap font-normal text-foreground">
        <CurrencyFlagCircle currency={currency} size={flagSize} />
        <span className="shrink-0 whitespace-nowrap text-sm text-foreground">
          {resolvedBalanceLabel}
        </span>
      </div>
    </div>
  )
}
