"use client"

import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatOfficeTimestamp } from "@/lib/format-office-date"
import { officeProviderLabel } from "@/lib/case/status"
import { officeTransactionDetailHref, officeTransactionDetailId } from "@/lib/office-transaction-path"
import { prefetchOfficeTransactionDetail } from "@/hooks/queries"
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
  const router = useRouter()
  const queryClient = useQueryClient()

  function warmTransaction(transaction: OfficeTransaction) {
    prefetchOfficeTransactionDetail(queryClient, officeTransactionDetailId(transaction))
  }

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
            return (
              <TableRow
                key={transaction.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => {
                  warmTransaction(transaction)
                  router.push(officeTransactionDetailHref(transaction))
                }}
                onPointerEnter={() => warmTransaction(transaction)}
                onFocus={() => warmTransaction(transaction)}
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
  )
}
