"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { consoleLivemodeQuery, parseConsoleLivemode } from "@/lib/console/livemode"
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

export function PlatformAccountsPage() {
  const livemode = parseConsoleLivemode(useSearchParams().get("livemode"))
  const query = useQuery({
    queryKey: ["platform-accounts", livemode],
    queryFn: async () => {
      const res = await fetchWithSession(`/api/platform/accounts?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as {
        accounts?: Account[]
        error?: string
      }
      if (!res.ok) throw new Error(body.error || "Could not load accounts")
      return body.accounts ?? []
    },
  })

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
                  {account.customer ? (
                    <Link
                      href={`/customers/${account.customer}${consoleLivemodeQuery(livemode)}`}
                      className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/50"
                    >
                      <AccountRow account={account} />
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-5 py-4">
                      <AccountRow account={account} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AccountRow({ account }: { account: Account }) {
  return (
    <>
      <div>
        <p className="text-sm font-medium">{account.customer_name || account.customer || account.id}</p>
        <p className="text-xs text-muted-foreground">
          {account.currency} · {account.id}
        </p>
      </div>
      <p className="text-sm font-medium">
        {formatCurrency(account.available / 100, account.currency)}
      </p>
    </>
  )
}
