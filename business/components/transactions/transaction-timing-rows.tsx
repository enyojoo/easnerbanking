import type { TransactionTimingRow } from "@easner/shared"

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
          className={
            className ??
            "flex items-center justify-between gap-4 border-b pb-4 text-sm last:border-b-0 last:pb-0"
          }
        >
          <span className="shrink-0 text-muted-foreground">{row.label}</span>
          <span className="text-right font-medium">{row.value}</span>
        </div>
      ))}
    </>
  )
}
