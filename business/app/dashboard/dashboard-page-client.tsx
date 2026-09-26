"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BalanceAmount, BALANCE_MASK } from "@/components/balance-amount"
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
import { TransactionDetailPrefetchLink } from "@/components/transactions/transaction-detail-prefetch-link"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { DateRangeFilter, type TimePeriod } from "@/components/date-range-filter"
import { cn, formatCurrency } from "@/lib/utils"
import { withReturnTo } from "@/lib/invoice-navigation"
import { useTransactionsCached } from "@/hooks/use-transactions-cached"
import { useTransactionsSummary } from "@/hooks/queries/use-transactions"
import { getDateRange, ledgerListRangeParams } from "@/lib/transactions"
import { formatTransactionRowDateTime, transactionStatusRowPresentation } from "@/lib/transaction-row-present"
import {
  useBusinessAccountRows,
  parseBalanceString,
} from "@/hooks/use-business-account-rows"
import { useFxRates } from "@/hooks/queries"
import { useTurnkeyLedgerRepair } from "@/hooks/use-turnkey-ledger-repair"
import {
  hasHistoricalBaseCurrencyMismatch,
  REPORTING_FX_BASE_CHANGE_NOTE,
} from "@/lib/fx/base-currency-display"
import { accountRestrictionDepositsBlockedCopy } from "@easner/shared"
import { useAccountRestriction } from "@/hooks/use-account-restriction"

export function DashboardPageClient() {
  const {
    data: rows,
    loading: listLoading,
    error: transactionsError,
    refetch: refetchTransactions,
  } = useTransactionsCached()
  const {
    balances,
    baseCurrency,
    hasAuthoritativeBalances,
    hasDisplayableBalances,
    loadError: accountsError,
    refreshAccounts,
  } = useBusinessAccountRows()
  const { data: fxRates = [] } = useFxRates()
  useTurnkeyLedgerRepair()
  const restrictionQuery = useAccountRestriction()
  const accountRestricted = Boolean(restrictionQuery.data?.active)
  const depositsBlocked = accountRestricted

  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  })
  const [balancesVisible, setBalancesVisible] = useState(true)
  const [lastStableBalance, setLastStableBalance] = useState<number | null>(null)

  const MASK = BALANCE_MASK

  const dateRangeOptions = { timePeriod, customDateRange }
  const { start, end } = getDateRange(dateRangeOptions)
  const listRange = ledgerListRangeParams(dateRangeOptions)
  const moneyFlow = useTransactionsSummary({
    from: listRange.from,
    to: listRange.to,
    baseCurrency,
  })

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

  const toBaseAmount = (amountAbs: number, currency: string, targetBase: string): number => {
    const c = currency.toUpperCase()
    const b = targetBase.toUpperCase()
    if (c === b) return amountAbs
    if (amountAbs === 0) return 0
    const rate = getFxRate(c, b)
    if (!rate) return amountAbs
    return amountAbs * rate
  }

  const moneyIn = moneyFlow.data?.moneyIn ?? 0
  const moneyOut = moneyFlow.data?.moneyOut ?? 0
  const showMoneyFlowPending = moneyFlow.isPending && moneyFlow.data == null

  const showBaseChangeNote = useMemo(
    () => hasHistoricalBaseCurrencyMismatch(filteredTransactions, baseCurrency),
    [filteredTransactions, baseCurrency],
  )

  const recentTransactions = useMemo(() => {
    return [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6)
  }, [rows])
  const showActivitySkeleton = listLoading && recentTransactions.length === 0

  const usdBal = parseBalanceString(balances.USD)
  const eurBal = parseBalanceString(balances.EUR)
  const code = baseCurrency
  const usdInBase = toBaseAmount(usdBal, "USD", code)
  const eurInBase = toBaseAmount(eurBal, "EUR", code)
  const computedPrimaryBalance = usdInBase + eurInBase
  const summaryCurrency = code
  useEffect(() => {
    if (!hasDisplayableBalances) return
    if (!Number.isFinite(computedPrimaryBalance)) return
    setLastStableBalance(computedPrimaryBalance)
  }, [computedPrimaryBalance, hasDisplayableBalances])
  /** Last good total, so a refetch never blanks the hero. */
  const heroBalance: number | null =
    lastStableBalance ?? (hasDisplayableBalances && Number.isFinite(computedPrimaryBalance) ? computedPrimaryBalance : null)
  const showBalancePending = balancesVisible && heroBalance == null

  // Soft refresh failures keep cached balances/activity. Full-page error only when
  // there is nothing usable to render. Account restriction blocks deposits, not the dashboard.
  const blockingLoadError = transactionsError || (accountsError && !accountRestricted ? accountsError : null)
  const hasUsableCachedDashboard =
    rows.length > 0 ||
    hasAuthoritativeBalances ||
    hasDisplayableBalances ||
    lastStableBalance != null ||
    listLoading

  if (blockingLoadError && !hasUsableCachedDashboard) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-destructive">{blockingLoadError}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void refetchTransactions()
            void refreshAccounts()
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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
                <h2 className="font-bold tracking-tight text-foreground">
                  <span className="inline-flex min-w-[12rem] items-center justify-start leading-none">
                    {showBalancePending ? (
                      <Skeleton className="h-14 w-64 max-w-full" />
                    ) : (
                      <BalanceAmount amount={heroBalance ?? 0} currency={code} hidden={!balancesVisible} size="hero" />
                    )}
                  </span>
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end shrink-0">
              <Button asChild size="sm" className="shadow-sm">
                <Link href="/send" className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Send
                </Link>
              </Button>
              {depositsBlocked ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title={accountRestrictionDepositsBlockedCopy()}
                  className="flex items-center gap-2"
                >
                  <ArrowDownCircle className="h-4 w-4" />
                  Deposit
                </Button>
              ) : (
                <Button variant="outline" asChild size="sm">
                  <Link href="/accounts" className="flex items-center gap-2">
                    <ArrowDownCircle className="h-4 w-4" />
                    Deposit
                  </Link>
                </Button>
              )}
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
                        showMoneyFlowPending ? (
                          <Skeleton className="h-6 w-28" />
                        ) : (
                          `+${formatCurrency(moneyIn, summaryCurrency)}`
                        )
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
                        showMoneyFlowPending ? (
                          <Skeleton className="h-6 w-28" />
                        ) : (
                          `-${formatCurrency(moneyOut, summaryCurrency)}`
                        )
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
          {showBaseChangeNote ? (
            <p className="text-xs text-muted-foreground mt-4 border-t border-border pt-3">
              {REPORTING_FX_BASE_CHANGE_NOTE}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent activity</h3>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions">View all</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            {showActivitySkeleton ?
              <div className="space-y-1 p-4">
                <div className="h-16 animate-pulse rounded-md bg-muted" />
                <div className="h-16 animate-pulse rounded-md bg-muted" />
                <div className="h-16 animate-pulse rounded-md bg-muted" />
              </div>
            : recentTransactions.length === 0 ?
              <div className="py-8 text-center text-sm text-muted-foreground">No transactions yet</div>
            : <div className="divide-y">
                {recentTransactions.map((txn) => {
                  const statusRow = transactionStatusRowPresentation(txn.status, txn.statusLabel)
                  return (
                    <div
                      key={txn.id}
                      className="flex min-w-0 items-center gap-3 p-4 transition-colors hover:bg-muted/50 cursor-pointer"
                    >
                      <TransactionDetailPrefetchLink
                        href={transactionWebDetailPath(txn.id, { returnTo: "dashboard" })}
                        txId={txn.id}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background ${
                            txn.direction === "credit" ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {txn.direction === "credit" ?
                            <ArrowDownLeft className="h-4 w-4" />
                          : <ArrowUpRight className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {(txn.description ?? "").replace(/^Transfer to\s+/i, "")}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {formatTransactionRowDateTime(txn.displayWhenAt ?? txn.date)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                          <p
                            className={`text-sm font-semibold tabular-nums ${txn.direction === "credit" ? "text-primary" : "text-foreground"}`}
                          >
                            {txn.direction === "credit" ? "+" : "-"}
                            {formatCurrency(Math.abs(txn.amount), txn.displayCurrency || "USD")}
                          </p>
                          <p className={`text-xs font-medium ${statusRow.className}`}>{statusRow.label}</p>
                        </div>
                      </TransactionDetailPrefetchLink>
                    </div>
                  )
                })}
              </div>
            }
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
