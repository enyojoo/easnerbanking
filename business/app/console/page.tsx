"use client"

import Link from "next/link"
import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ConsoleAuditLogCard } from "@/components/console/console-audit-log-card"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { ConsoleQuickstartCard } from "@/components/console/console-quickstart-card"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { useCheckoutSettings } from "@/hooks/use-checkout-settings"
import { usePlatformOverview } from "@/hooks/use-platform-overview"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { formatTransactionRowDateTime, transactionStatusRowPresentation } from "@/lib/transaction-row-present"
import { formatCurrency } from "@/lib/utils"

export default function ConsoleHomePage() {
  const { livemode } = useConsoleLivemode()
  const overview = usePlatformOverview(livemode)
  const { data: checkout } = useCheckoutSettings()

  const recent = overview.data?.recentTransactions ?? []
  const lastError = overview.data?.lastError ?? null
  const lastWebhook = checkout?.settings.lastWebhookDeliveredAt
  const transactionCount = overview.data?.transactionCount ?? 0
  const last4xx =
    lastError && lastError.status != null && lastError.status >= 400 && lastError.status < 500 ? lastError : null

  return (
    <div className="space-y-6">
      <ConsolePageHeader title={PAGE_COPY.console.title} description={PAGE_COPY.console.intro} />
      <ConsoleQuickstartCard />
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Go live after a test send, test receive, and test Checkout, then mint a live key and add a live webhook.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/customers" className="underline underline-offset-2">
              Receive
            </Link>
            <Link href="/checkout" className="underline underline-offset-2">
              Checkout
            </Link>
            <Link href="/console/keys" className="underline underline-offset-2">
              Keys
            </Link>
            <Link href="/console/webhooks" className="underline underline-offset-2">
              Webhooks
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Payments</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {overview.isPending && !overview.data ? "—" : transactionCount.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">in this mode</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Last webhook</p>
            <p className="mt-1 truncate text-sm font-medium">
              {lastWebhook ? new Date(lastWebhook).toLocaleString() : "None yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">most recent delivery</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Last 4xx</p>
            <p className="mt-1 truncate text-sm font-medium">
              {last4xx ? `${last4xx.method} ${last4xx.path} · ${last4xx.status}` : "None"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {last4xx ? new Date(last4xx.created_at).toLocaleString() : "API errors in this mode"}
            </p>
          </CardContent>
        </Card>
      </div>

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
              <div className="py-8 text-center text-sm text-muted-foreground">No payments yet</div>
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
                        <p className="truncate text-sm font-medium text-foreground">{txn.description || txn.type}</p>
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

      <ConsoleAuditLogCard />
    </div>
  )
}
