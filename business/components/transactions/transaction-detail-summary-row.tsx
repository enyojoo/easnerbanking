"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  label: string
  value?: ReactNode
  valueClassName?: string
  children?: ReactNode
}

/** Bordered label/value row — shared by deposit and payout transaction detail cards. */
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
        <span className={cn("text-right font-medium", valueClassName)}>{value}</span>
      )}
    </div>
  )
}

export const transactionDetailRowClassName =
  "flex items-start justify-between gap-4 border-b border-border py-2 text-sm"
