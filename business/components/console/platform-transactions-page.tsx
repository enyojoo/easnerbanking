"use client"

import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { PageIntro } from "@/components/copy/page-intro"
import { ConsoleModeSwitch } from "@/components/console/console-mode-switch"
import { parseConsoleLivemode } from "@/lib/console/livemode"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { formatCurrency } from "@/lib/utils"

type Row = {
  id: string
  type: string
  amount: number
  currency: string
  direction: string
  status: string
  description: string | null
  created: string
}

export function PlatformTransactionsPage() {
  const livemode = parseConsoleLivemode(useSearchParams().get("livemode"))
  const query = useQuery({
    queryKey: ["platform-transactions", livemode],
    queryFn: async () => {
      const res = await fetchWithSession(`/api/platform/transactions?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as { transactions?: Row[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load transactions")
      return body.transactions ?? []
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageIntro
          title="Transactions"
          description="Platform ledger only. Banking Send and invoices are not listed here."
          variant="page"
        />
        <ConsoleModeSwitch />
      </div>
      <Card>
        <CardContent className="p-0">
          {(query.data ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No platform transactions yet.</p>
          ) : (
            <ul className="divide-y">
              {(query.data ?? []).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                  <div>
                    <p className="text-sm font-medium">{row.description || row.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.id} · {row.status} · {new Date(row.created).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {row.direction === "out" ? "−" : "+"}
                    {formatCurrency(row.amount / 100, row.currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
