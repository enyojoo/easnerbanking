"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  label: string
  value?: ReactNode
  valueClassName?: string
  children?: ReactNode
}

/** Primary money totals only – same text-sm size as other values, heavier weight. */
export const TRANSACTION_DETAIL_MONEY_VALUE_CLASS = "font-semibold"

/** Bordered label/value row – shared by deposit and payout transaction detail cards. */
export function TransactionDetailSummaryRow({
  label,
  value,
  valueClassName,
  children,
}: Props) {
  return (
    <div className={transactionDetailRowClassName}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {children ?? (
        <span className={cn("min-w-0 flex-1 text-right font-normal text-foreground", valueClassName)}>
          {value}
        </span>
      )}
    </div>
  )
}

export const transactionDetailRowClassName =
  "flex items-center justify-between gap-6 border-b border-border py-3 text-sm"
