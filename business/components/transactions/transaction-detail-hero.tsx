"use client"

import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { formatMoneyDisplay } from "@easner/shared"
import type { Transaction } from "@/lib/finance-types"
import {
  resolveTransactionDetailHeroAmount,
  resolveTransactionDetailHeroTitle,
} from "@/lib/transactions/resolve-transaction-detail-hero"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type Props = {
  transaction: Transaction
}

function statusLabel(status: Transaction["status"]): string {
  if (status === "completed") return "Completed"
  if (status === "failed") return "Failed"
  return "Processing"
}

export function TransactionDetailHero({ transaction }: Props) {
  const isCredit = transaction.direction === "credit"
  const title = resolveTransactionDetailHeroTitle(transaction)
  const { amount, currency } = resolveTransactionDetailHeroAmount(transaction)
  const amountText = formatMoneyDisplay(amount, currency)
  const signedAmount = `${isCredit ? "+" : "-"}${amountText}`

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="flex flex-col items-center px-6 py-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          {isCredit ? (
            <ArrowDownLeft className="h-7 w-7 text-primary" strokeWidth={2.25} />
          ) : (
            <ArrowUpRight className="h-7 w-7 text-primary" strokeWidth={2.25} />
          )}
        </div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p
          className={`mt-2 text-3xl font-semibold tabular-nums ${
            isCredit ? "text-primary" : "text-foreground"
          }`}
        >
          {signedAmount}
        </p>
        <Badge
          variant={
            transaction.status === "completed"
              ? "default"
              : transaction.status === "pending" || transaction.status === "processing"
                ? "secondary"
                : "destructive"
          }
          className="mt-4 capitalize"
        >
          {statusLabel(transaction.status)}
        </Badge>
      </CardContent>
    </Card>
  )
}
