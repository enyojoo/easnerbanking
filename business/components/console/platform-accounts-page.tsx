"use client"

import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { PageIntro } from "@/components/copy/page-intro"
import { ConsoleModeSwitch } from "@/components/console/console-mode-switch"
import { parseConsoleLivemode } from "@/lib/console/livemode"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { formatCurrency } from "@/lib/utils"

export function PlatformAccountsPage() {
  const livemode = parseConsoleLivemode(useSearchParams().get("livemode"))
  const query = useQuery({
    queryKey: ["platform-accounts", livemode],
    queryFn: async () => {
      const res = await fetchWithSession(`/api/platform/accounts?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as {
        accounts?: { id: string; currency: string; available: number; pending: number }[]
        error?: string
      }
      if (!res.ok) throw new Error(body.error || "Could not load accounts")
      return body.accounts ?? []
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageIntro
          title="Accounts"
          description="Platform book only. Banking balances stay on Banking Accounts."
          variant="page"
        />
        <ConsoleModeSwitch />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(query.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No platform accounts yet. POST /v1/accounts or collect Checkout with a secret key.
            </CardContent>
          </Card>
        ) : (
          (query.data ?? []).map((account) => (
            <Card key={account.id}>
              <CardContent className="space-y-2 p-6">
                <p className="text-sm text-muted-foreground">{account.currency}</p>
                <p className="text-2xl font-semibold">
                  {formatCurrency(account.available / 100, account.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Pending {formatCurrency(account.pending / 100, account.currency)} · {account.id}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
