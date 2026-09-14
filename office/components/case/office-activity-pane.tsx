"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OfficeTransactionDetailPanel } from "@/components/transactions/office-transaction-detail-panel"
import { formatOfficeTimestamp } from "@/lib/format-office-date"
import { officeProviderLabel } from "@/lib/case/status"
import type { OfficeTransaction } from "@/lib/types/office-transaction"
import {
  ledgerTransactionStatusDisplay,
  type LedgerTransactionStatusTone,
} from "@easner/shared"

function transactionStatusBadgeVariant(
  tone: LedgerTransactionStatusTone,
): "emerald" | "amber" | "oxblood" | "slate" | "outline" {
  switch (tone) {
    case "completed":
      return "emerald"
    case "pending":
      return "amber"
    case "processing":
      return "outline"
    case "failed":
      return "oxblood"
    case "cancelled":
      return "slate"
    default:
      return "outline"
  }
}

export function OfficeActivityPane({
  transactions,
  loading,
  error,
}: {
  transactions: OfficeTransaction[]
  loading: boolean
  error?: string | null
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = transactions.find((tx) => tx.id === selectedId) ?? null

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
      <div className="overflow-x-auto rounded-3xl border border-border/60 bg-card shadow-[var(--shadow-soft)] dark:shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => {
              const { label: statusLabel, tone } = ledgerTransactionStatusDisplay(transaction.status)
              const active = selectedId === transaction.id
              return (
                <TableRow
                  key={transaction.id}
                  className={active ? "bg-muted/60" : "cursor-pointer hover:bg-muted/40"}
                  onClick={() => setSelectedId(transaction.id)}
                >
                  <TableCell>
                    <div className="font-medium text-sm">
                      {transaction.label || transaction.easner_transaction_id || transaction.id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {officeProviderLabel(transaction.provider)}
                    </div>
                  </TableCell>
                  <TableCell>{formatOfficeTimestamp(transaction.occurred_at || transaction.created_at)}</TableCell>
                  <TableCell>
                    {transaction.productLabel ? <Badge variant="outline">{transaction.productLabel}</Badge> : "–"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {transaction.amountFormatted ||
                      `${Number(transaction.displayAmount ?? transaction.amount ?? 0).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} ${String(transaction.displayCurrency ?? transaction.currency ?? "").toUpperCase()}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={transactionStatusBadgeVariant(tone)}>{statusLabel}</Badge>
                  </TableCell>
                </TableRow>
              )
            })}
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <div className="min-h-[220px] rounded-3xl border border-border/60 bg-card p-5 shadow-[var(--shadow-soft)] dark:shadow-none">
        {selected ? (
          <OfficeTransactionDetailPanel transaction={selected} />
        ) : (
          <p className="text-sm text-muted-foreground">Select a transaction to inspect it here.</p>
        )}
      </div>
    </div>
  )
}
