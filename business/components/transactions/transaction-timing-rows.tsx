import type { TransactionTimingRow } from "@easner/shared"
import { transactionDetailRowClassName } from "@/components/transactions/transaction-detail-summary-row"

type Props = {
  rows?: TransactionTimingRow[] | null
  className?: string
}

export function TransactionTimingRows({ rows, className }: Props) {
  if (!rows?.length) return null

  return (
    <>
      {rows.map((row) => (
        <div
          key={row.label}
          className={className ?? transactionDetailRowClassName}
        >
          <span className="shrink-0 text-muted-foreground">{row.label}</span>
          <span className="text-right font-normal text-foreground">{row.value}</span>
        </div>
      ))}
    </>
  )
}
