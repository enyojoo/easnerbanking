"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowDownLeft, ArrowUpRight, Eye, EyeOff, TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConsoleWorkspaceActions } from "@/components/console/console-workspace-actions"
import { useCheckoutSettings } from "@/hooks/use-checkout-settings"
import { usePlatformOverview } from "@/hooks/use-platform-overview"
import { parseConsoleLivemode } from "@/lib/console/livemode"
import { formatTransactionRowDateTime, transactionStatusRowPresentation } from "@/lib/transaction-row-present"
import { cn, formatCurrency } from "@/lib/utils"

const MASK = "******"

function formatVolumeParts(usdTotal: number, eurTotal: number): string {
  const parts: string[] = []
  if (usdTotal > 0) parts.push(formatCurrency(usdTotal / 100, "USD"))
  if (eurTotal > 0) parts.push(formatCurrency(eurTotal / 100, "EUR"))
  return parts.length > 0 ? parts.join(" · ") : formatCurrency(0, "USD")
}

export default function ConsoleHomePage() {
  const livemode = parseConsoleLivemode(useSearchParams().get("livemode"))
  const overview = usePlatformOverview(livemode)
  const { data: checkout } = useCheckoutSettings()
  const [amountsVisible, setAmountsVisible] = useState(true)

  const volume = overview.data?.volume
  const usdTotal = volume?.USD.total ?? 0
  const eurTotal = volume?.EUR.total ?? 0
  const inOutCurrency = usdTotal >= eurTotal ? "USD" : "EUR"
  const inOutSide = volume?.[inOutCurrency]
  const moneyIn = (inOutSide?.moneyIn ?? 0) / 100
  const moneyOut = (inOutSide?.moneyOut ?? 0) / 100
  const recent = overview.data?.recentTransactions ?? []
  const lastError = overview.data?.lastError ?? null
  const lastWebhook = checkout?.settings.lastWebhookDeliveredAt
  const transactionCount = overview.data?.transactionCount ?? 0
  const showVolumePending = overview.isPending && !overview.data
  const volumeLabel = formatVolumeParts(usdTotal, eurTotal)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Total Volume</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setAmountsVisible((value) => !value)}
                  aria-pressed={amountsVisible}
                  aria-label={amountsVisible ? "Hide amounts" : "Show amounts"}
                >
                  {amountsVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <h2 className="text-6xl font-bold tracking-tight text-foreground">
                <span
                  className={cn(
                    "inline-flex min-w-[12rem] items-center justify-start leading-none tabular-nums",
                    !amountsVisible && "tracking-[0.2em]",
                  )}
                >
                  {showVolumePending ? (
                    <Skeleton className="h-14 w-64 max-w-full" />
                  ) : amountsVisible ? (
                    volumeLabel
                  ) : (
                    MASK
                  )}
                </span>
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {transactionCount.toLocaleString()}{" "}
                {transactionCount === 1 ? "transaction" : "transactions"}
              </p>
            </div>
            <ConsoleWorkspaceActions />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="flex gap-12">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Money in
                  </p>
                  <p className="text-lg font-semibold text-primary">
                    <span
                      className={cn(
                        "inline-flex min-w-[9.5rem] items-center justify-start tabular-nums leading-none",
                        !amountsVisible && "tracking-wider",
                      )}
                    >
                      {amountsVisible ? `+${formatCurrency(moneyIn, inOutCurrency)}` : MASK}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-muted p-2">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Money out
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    <span
                      className={cn(
                        "inline-flex min-w-[9.5rem] items-center justify-start tabular-nums leading-none",
                        !amountsVisible && "tracking-wider",
                      )}
                    >
                      {amountsVisible ? `-${formatCurrency(moneyOut, inOutCurrency)}` : MASK}
                    </span>
                  </p>
                </div>
              </div>
            </div>
            {lastWebhook || lastError ? (
              <div className="max-w-[18rem] space-y-1 text-right text-xs text-muted-foreground">
                {lastWebhook ? <p className="truncate">Last webhook {new Date(lastWebhook).toLocaleString()}</p> : null}
                {lastError ? (
                  <p className="truncate">
                    Last error {lastError.method} {lastError.path} · {lastError.status}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
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
            {overview.isPending && recent.length === 0 ? (
              <div className="space-y-1 p-4">
                <div className="h-16 animate-pulse rounded-md bg-muted" />
                <div className="h-16 animate-pulse rounded-md bg-muted" />
                <div className="h-16 animate-pulse rounded-md bg-muted" />
              </div>
            ) : recent.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No transactions yet
              </div>
            ) : (
              <div className="divide-y">
                {recent.map((txn) => {
                  const statusRow = transactionStatusRowPresentation(txn.status)
                  return (
                    <Link
                      key={txn.id}
                      href="/transactions"
                      className="flex min-w-0 items-center gap-3 p-4 transition-colors hover:bg-muted/50"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background ${
                          txn.direction === "in" ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {txn.direction === "in" ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {txn.description || txn.type}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {formatTransactionRowDateTime(txn.created)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                        <p
                          className={`text-sm font-semibold tabular-nums ${
                            txn.direction === "in" ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {txn.direction === "in" ? "+" : "-"}
                          {formatCurrency(Math.abs(txn.amount) / 100, txn.currency)}
                        </p>
                        <p className={`text-xs font-medium ${statusRow.className}`}>{statusRow.label}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
