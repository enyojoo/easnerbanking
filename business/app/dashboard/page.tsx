"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  ArrowDownCircle,
  Plus,
  CreditCard,
  Eye,
  EyeOff,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { TransactionDetailsDialog } from "@/components/transaction-details-dialog"
import { DateRangeFilter, type TimePeriod } from "@/components/date-range-filter"
import { cn, formatCurrency } from "@/lib/utils"
import { withReturnTo } from "@/lib/invoice-navigation"
import { useTransactionsCached } from "@/hooks/use-transactions-cached"
import { getDateRange, type TransactionWithSource } from "@/lib/transactions"
import {
  useBusinessAccountRows,
  parseBalanceString,
} from "@/hooks/use-business-account-rows"
import { useFxRates } from "@/hooks/queries"

export default function DashboardPage() {
  const { data: rows } = useTransactionsCached()
  const { balances, baseCurrency } = useBusinessAccountRows()
  const { data: fxRates = [] } = useFxRates()
  const [stablePrimaryBalance, setStablePrimaryBalance] = useState<number | null>(null)

  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithSource | null>(null)
  const [transactionDetailsOpen, setTransactionDetailsOpen] = useState(false)
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  })
  const [balancesVisible, setBalancesVisible] = useState(true)

  const MASK = "******"

  const { start, end } = getDateRange({ timePeriod, customDateRange })

  const filteredTransactions = useMemo(() => {
    return rows.filter((t) => {
      const d = new Date(t.date).getTime()
      return d >= start.getTime() && d <= end.getTime()
    })
  }, [rows, start, end])

  const getFxRate = (from: string, to: string): number | null => {
    const f = from.toUpperCase()
    const t = to.toUpperCase()
    if (f === t) return 1
    const direct = fxRates.find((r) => r.from_currency === f && r.to_currency === t)?.rate
    if (direct && Number.isFinite(direct) && direct > 0) return direct
    const inverse = fxRates.find((r) => r.from_currency === t && r.to_currency === f)?.rate
    if (inverse && Number.isFinite(inverse) && inverse > 0) return 1 / inverse
    return null
  }

  const toBaseAmount = (amountAbs: number, currency: string, targetBase: string): number | null => {
    const c = currency.toUpperCase()
    const b = targetBase.toUpperCase()
    if (c === b) return amountAbs
    const rate = getFxRate(c, b)
    if (!rate) return null
    return amountAbs * rate
  }

  const amountInBase = (t: TransactionWithSource, targetBase: string): number => {
    const absAmount = Math.abs(t.amount)
    if (
      typeof t.baseAmount === "number" &&
      Number.isFinite(t.baseAmount) &&
      String(t.baseCurrency || "").toUpperCase() === targetBase.toUpperCase()
    ) {
      return Math.abs(t.baseAmount)
    }
    const converted = toBaseAmount(absAmount, t.displayCurrency || "USD", targetBase)
    if (converted != null) return converted
    return absAmount
  }

  const moneyIn = filteredTransactions
    .filter((t) => t.direction === "credit")
    .reduce((sum, t) => sum + amountInBase(t, baseCurrency), 0)
  const moneyOut = filteredTransactions
    .filter((t) => t.direction === "debit")
    .reduce((sum, t) => sum + amountInBase(t, baseCurrency), 0)

  const recentTransactions = useMemo(() => {
    return [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6)
  }, [rows])

  const usdBal = parseBalanceString(balances.USD)
  const eurBal = parseBalanceString(balances.EUR)
  const code = baseCurrency
  const usdInBase = toBaseAmount(usdBal, "USD", code)
  const eurInBase = toBaseAmount(eurBal, "EUR", code)
  const computedPrimaryBalance =
    usdInBase != null && eurInBase != null ? usdInBase + eurInBase
    : null
  const summaryCurrency = code

  useEffect(() => {
    const cacheKey = `easner_primary_balance_${code}`
    if (computedPrimaryBalance != null && Number.isFinite(computedPrimaryBalance)) {
      setStablePrimaryBalance(computedPrimaryBalance)
      try {
        window.localStorage.setItem(cacheKey, String(computedPrimaryBalance))
      } catch {
        // ignore quota
      }
      return
    }
    try {
      const raw = window.localStorage.getItem(cacheKey)
      const cached = raw != null ? Number(raw) : Number.NaN
      if (Number.isFinite(cached)) {
        setStablePrimaryBalance(cached)
      }
    } catch {
      // ignore read errors
    }
  }, [computedPrimaryBalance, code])

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
                  <span className="inline-flex items-center gap-1 leading-none tabular-nums">
                    <span
                      className={cn(
                        "inline-flex min-w-[12rem] items-center justify-start leading-none",
                        !balancesVisible && "tracking-[0.2em]",
                      )}
                    >
                      {balancesVisible ?
                        stablePrimaryBalance == null ? "—" : formatCurrency(stablePrimaryBalance, code)
                      : MASK}
                    </span>
                  </span>
                </h2>
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
                <Link href={withReturnTo("/invoices/create", "/dashboard")} className="flex items-center gap-2">
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
                <div className="p-2 rounded-full bg-primary/10">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">Money in</p>
                  <p className="text-lg font-semibold text-primary">
                    <span
                      className={cn(
                        "inline-flex min-w-[9.5rem] items-center justify-start tabular-nums leading-none self-center",
                        !balancesVisible && "tracking-wider",
                      )}
                    >
                      {balancesVisible ?
                        `+${formatCurrency(moneyIn, summaryCurrency)}`
                      : MASK}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-muted">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">Money out</p>
                  <p className="text-lg font-semibold text-foreground">
                    <span
                      className={cn(
                        "inline-flex min-w-[9.5rem] items-center justify-start tabular-nums leading-none",
                        !balancesVisible && "tracking-wider",
                      )}
                    >
                      {balancesVisible ?
                        `-${formatCurrency(moneyOut, summaryCurrency)}`
                      : MASK}
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
            {recentTransactions.length === 0 ?
              <div className="py-8 text-center text-sm text-muted-foreground">No transactions yet</div>
            : <div className="divide-y">
                {recentTransactions.map((txn) => {
                  const cur = txn.displayCurrency || "USD"
                  return (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <Link
                        href={`/transactions?txnId=${encodeURIComponent(txn.id)}`}
                        className="flex min-w-0 flex-1 items-center justify-between gap-4"
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey) return
                          e.preventDefault()
                          setSelectedTransaction(txn)
                          setTransactionDetailsOpen(true)
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`shrink-0 rounded-full p-2 ${txn.direction === "credit" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                          >
                            {txn.direction === "credit" ?
                              <ArrowDownLeft className="h-4 w-4" />
                            : <ArrowUpRight className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{txn.description}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {new Date(txn.date).toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })}{" "}
                              •{" "}
                              {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
                            </p>
                          </div>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-semibold tabular-nums ${txn.direction === "credit" ? "text-primary" : "text-foreground"}`}
                        >
                          {txn.direction === "credit" ? "+" : "-"}
                          {formatCurrency(Math.abs(txn.amount), cur)}
                        </p>
                      </Link>
                    </div>
                  )
                })}
              </div>
            }
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
