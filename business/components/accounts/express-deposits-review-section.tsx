"use client"

import {
  buildExpressDepositsReviewRows,
  type ExpressDepositsPricingBreakdown,
  type CashPayInMethodKind,
} from "@easner/shared"
import {
  TransactionDetailSummaryRow,
  TRANSACTION_DETAIL_MONEY_VALUE_CLASS,
} from "@/components/transactions/transaction-detail-summary-row"
import { cn } from "@/lib/utils"

type ExpressKind = Extract<
  CashPayInMethodKind,
  "express_card" | "express_apple_pay" | "express_google_pay" | "express_ach"
>

type Props = {
  pricing: ExpressDepositsPricingBreakdown
  method: ExpressKind
}

export function ExpressDepositsReviewSection({ pricing, method }: Props) {
  const rows = buildExpressDepositsReviewRows({ pricing, method, surface: "review" })
  return (
    <div className="rounded-lg border border-border px-4">
      {rows.map((row) => (
        <TransactionDetailSummaryRow
          key={row.id}
          label={row.label}
          value={row.value}
          valueClassName={row.valueBold ? cn(TRANSACTION_DETAIL_MONEY_VALUE_CLASS) : undefined}
        />
      ))}
    </div>
  )
}
