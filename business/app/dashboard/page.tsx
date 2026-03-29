"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  mockTransactions,
  getTotalBalanceInDefaultCurrency,
  type Transaction,
} from "@/lib/mock-data"
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Send,
  ArrowDownCircle,
  Plus,
  CreditCard,
  Eye,
  EyeOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { TransactionDetailsDialog } from "@/components/transaction-details-dialog"
import { DateRangeFilter, type TimePeriod } from "@/components/date-range-filter"
import { cn } from "@/lib/utils"

export default function DashboardPage() {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [transactionDetailsOpen, setTransactionDetailsOpen] = useState(false)
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  })
  const [balancesVisible, setBalancesVisible] = useState(true)

  const MASK = "******"

  const totalBalance = getTotalBalanceInDefaultCurrency()
  const recentTransactions = mockTransactions.slice(0, 6)

  const getDateRange = () => {
    const now = new Date()
    const startDate = new Date()

    if (timePeriod === "all") {
      return { start: new Date(0), end: now }
    }

    if (timePeriod === "custom" && customDateRange.from && customDateRange.to) {
      return { start: customDateRange.from, end: customDateRange.to }
    }

    switch (timePeriod) {
      case "7d":
        startDate.setDate(now.getDate() - 7)
        break
      case "30d":
        startDate.setDate(now.getDate() - 30)
        break
      case "90d":
        startDate.setDate(now.getDate() - 90)
        break
      case "1y":
        startDate.setFullYear(now.getFullYear() - 1)
        break
    }

    return { start: startDate, end: now }
  }

  const { start, end } = getDateRange()
  const filteredTransactions = mockTransactions.filter((t) => {
    const txnDate = new Date(t.date)
    return txnDate >= start && txnDate <= end
  })

  const moneyIn = filteredTransactions.filter((t) => t.direction === "credit").reduce((sum, t) => sum + t.amount, 0)
  const moneyOut = filteredTransactions.filter((t) => t.direction === "debit").reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-medium text-muted-foreground">Total Balance</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setBalancesVisible((v) => !v)}
                  aria-pressed={balancesVisible}
                  aria-label={balancesVisible ? "Hide balances" : "Show balances"}
                >
                  {balancesVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-baseline gap-3">
                <h2 className="text-6xl font-bold tracking-tight text-foreground">
                  <span className="inline-flex items-center gap-1 leading-none">
                    <span className="shrink-0 self-center">$</span>
                    <span
                      className={cn(
                        "inline-flex min-w-[12rem] items-center justify-start tabular-nums leading-none",
                        !balancesVisible && "tracking-[0.2em]",
                      )}
                    >
                      {balancesVisible
                        ? totalBalance.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : MASK}
                    </span>
                  </span>
                </h2>
                <div
                  className={`flex items-center gap-1 text-green-600 ${!balancesVisible ? "invisible" : ""}`}
                  aria-hidden={!balancesVisible}
                >
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">+2.4%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                In your base currency from all accounts
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end shrink-0">
              <Button asChild size="sm" className="shadow-sm">
                <Link href="/send" className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Send
                </Link>
              </Button>
              <Button variant="outline" asChild size="sm">
                <Link href="/accounts" className="flex items-center gap-2">
                  <ArrowDownCircle className="h-4 w-4" />
                  Deposit
                </Link>
              </Button>
              <Button variant="outline" asChild size="sm">
                <Link href="/invoices/create" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create Invoice
                </Link>
              </Button>
              <Button variant="outline" asChild size="sm">
                <Link href="/cards" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Cards
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex gap-12">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-50 dark:bg-green-900/20">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Money in</p>
                  <p className="text-lg font-bold text-green-600">
                    <span className="inline-flex items-center gap-0.5 leading-none">
                      <span className="shrink-0 self-center">$</span>
                      <span
                        className={cn(
                          "inline-flex min-w-[9.5rem] items-center justify-start tabular-nums leading-none self-center",
                          !balancesVisible && "tracking-wider",
                        )}
                      >
                        {balancesVisible
                          ? moneyIn.toLocaleString("en-US", { minimumFractionDigits: 2 })
                          : MASK}
                      </span>
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-50 dark:bg-red-900/20">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Money out</p>
                  <p className="text-lg font-bold text-red-600">
                    <span className="inline-flex items-center gap-0.5 leading-none">
                      <span className="shrink-0 self-center">-$</span>
                      <span
                        className={cn(
                          "inline-flex min-w-[9.5rem] items-center justify-start tabular-nums leading-none",
                          !balancesVisible && "tracking-wider",
                        )}
                      >
                        {balancesVisible
                          ? moneyOut.toLocaleString("en-US", { minimumFractionDigits: 2 })
                          : MASK}
                      </span>
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <DateRangeFilter
              timePeriod={timePeriod}
              customDateRange={customDateRange}
              onTimePeriodChange={setTimePeriod}
              onCustomDateRangeChange={setCustomDateRange}
            />
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent activity</h3>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions">View all</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentTransactions.map((txn) => (
                <div
                  key={txn.id}
                  onClick={() => {
                    setSelectedTransaction(txn)
                    setTransactionDetailsOpen(true)
                  }}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-full p-2 ${txn.direction === "credit" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}
                    >
                      {txn.direction === "credit" ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{txn.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {txn.type.toUpperCase()} • {new Date(txn.date).toLocaleDateString()} •{" "}
                        {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-sm font-semibold tabular-nums ${txn.direction === "credit" ? "text-green-600" : "text-foreground"}`}
                  >
                    {txn.direction === "credit" ? "+" : "-"}${txn.amount.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <TransactionDetailsDialog
        open={transactionDetailsOpen}
        onOpenChange={setTransactionDetailsOpen}
        transaction={selectedTransaction}
      />
    </div>
  )
}
