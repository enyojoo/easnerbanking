"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { InfiniteData } from "@tanstack/react-query"
import type { TransactionsPage } from "@/hooks/queries/use-transactions"
import type { TransactionWithSource } from "@/lib/transactions"
import { cn } from "@/lib/utils"

/**
 * Virtualized ledger primitive.
 *
 * Consumes the output of `useTransactionsList()` and renders only the rows
 * in view, keeping frame times flat even on multi-thousand-row ledgers.
 * The caller owns row rendering so tables stay flexible.
 *
 * `onNearEnd` is invoked once per scroll sweep when the user is within
 * `overscan` rows of the bottom — wire it to `fetchNextPage` to get
 * seamless pagination.
 */

type Props = {
  data: InfiniteData<TransactionsPage> | undefined
  estimateRowHeight?: number
  overscan?: number
  onNearEnd?: () => void
  renderRow: (tx: TransactionWithSource, index: number) => React.ReactNode
  className?: string
  /** Minimum height before any rows arrive — keeps layout from collapsing. */
  placeholderMinHeight?: number
}

export function VirtualizedTransactions({
  data,
  estimateRowHeight = 56,
  overscan = 8,
  onNearEnd,
  renderRow,
  className,
  placeholderMinHeight = 320,
}: Props) {
  const parentRef = React.useRef<HTMLDivElement | null>(null)

  const rows = React.useMemo<TransactionWithSource[]>(() => {
    if (!data) return []
    return data.pages.flatMap((p) => p.transactions)
  }, [data])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
  })

  const lastAtEndRef = React.useRef(false)
  React.useEffect(() => {
    if (!onNearEnd || rows.length === 0) return
    const items = rowVirtualizer.getVirtualItems()
    if (items.length === 0) return
    const last = items[items.length - 1]
    const nearEnd = last.index >= rows.length - overscan
    if (nearEnd && !lastAtEndRef.current) {
      lastAtEndRef.current = true
      onNearEnd()
    } else if (!nearEnd) {
      lastAtEndRef.current = false
    }
  }, [rowVirtualizer, rows.length, overscan, onNearEnd])

  if (rows.length === 0) {
    return (
      <div
        ref={parentRef}
        style={{ minHeight: placeholderMinHeight }}
        className={cn("w-full overflow-auto", className)}
      />
    )
  }

  return (
    <div
      ref={parentRef}
      className={cn("w-full overflow-auto", className)}
      style={{ contain: "strict" }}
    >
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const tx = rows[virtualRow.index]
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderRow(tx, virtualRow.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
