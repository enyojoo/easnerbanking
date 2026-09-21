"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { CopyId } from "@/components/console/copy-id"
import { ReceiveRailsPanel } from "@/components/console/receive-rails-panel"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { formatCurrency } from "@/lib/utils"

type Account = {
  id: string
  currency: string
  available: number
  pending: number
  customer: string | null
  customer_name: string | null
}

type Detail = {
  account: Account & { customer_verification?: string | null }
  transactions: {
    id: string
    type: string
    amount: number
    currency: string
    direction: string
    status: string
    description: string | null
    created: string
  }[]
}

function vaultAsset(currency: string) {
  if (currency === "USD") return "USDC"
  if (currency === "EUR") return "EURC"
  return currency
}

export function PlatformAccountsPage() {
  const { livemode } = useConsoleLivemode()
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedId = searchParams.get("id")

  const query = useQuery({
    queryKey: ["platform-accounts", livemode],
    queryFn: async () => {
      const res = await fetchWithSession(`/api/platform/accounts?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as { accounts?: Account[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load accounts")
      return body.accounts ?? []
    },
  })

  const detail = useQuery({
    queryKey: ["platform-account", selectedId, livemode],
    enabled: Boolean(selectedId),
    queryFn: async (): Promise<Detail> => {
      const res = await fetchWithSession(`/api/platform/accounts/${selectedId}?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as Detail & { error?: string }
      if (!res.ok || !body.account) throw new Error(body.error || "Could not load account")
      return { account: body.account, transactions: body.transactions ?? [] }
    },
  })

  const close = () => {
    router.replace("/accounts", { scroll: false })
  }

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title={PAGE_COPY.consoleAccounts.title}
        description={PAGE_COPY.consoleAccounts.intro}
      />
      <Card>
        <CardContent className="p-0">
          {(query.data ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{PAGE_COPY.consoleAccounts.empty}</p>
          ) : (
            <ul className="divide-y">
              {(query.data ?? []).map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/accounts?id=${account.id}`)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{account.customer_name || account.customer || account.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {vaultAsset(account.currency)} · {account.id}
                      </p>
                    </div>
                    <p className="text-sm font-medium">{formatCurrency(account.available / 100, account.currency)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && close()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Customer vault</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 px-4 pb-6">
            {detail.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : detail.data ? (
              <>
                <div className="space-y-1">
                  <CopyId id={detail.data.account.id} />
                  {detail.data.account.customer ? (
                    <Link
                      href={`/customers/${detail.data.account.customer}`}
                      className="block text-sm underline underline-offset-2"
                    >
                      {detail.data.account.customer_name || detail.data.account.customer}
                    </Link>
                  ) : null}
                  <ButtonLink accountId={detail.data.account.id} />
                </div>
                <ReceiveRailsPanel
                  accountId={detail.data.account.id}
                  currency={detail.data.account.currency}
                  available={detail.data.account.available}
                  pending={detail.data.account.pending}
                  showSimulate
                />
                <div>
                  <p className="mb-2 text-sm font-medium">Recent payments</p>
                  {(detail.data.transactions ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments yet.</p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {detail.data.transactions.map((row) => (
                        <li key={row.id}>
                          <Link
                            href={`/transactions?id=${row.id}`}
                            className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/40"
                          >
                            <span>{row.description || row.type}</span>
                            <span>
                              {row.direction === "out" ? "−" : "+"}
                              {formatCurrency(row.amount / 100, row.currency)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Account not found.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ButtonLink({ accountId }: { accountId: string }) {
  return (
    <Link href={`/console/explorer?endpoint=accounts.retrieve&id=${accountId}`} className="text-xs underline underline-offset-2">
      Open in Workbench
    </Link>
  )
}
