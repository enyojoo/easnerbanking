"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { CopyId } from "@/components/console/copy-id"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { formatCurrency } from "@/lib/utils"
import Link from "next/link"

type Row = {
  id: string
  type: string
  amount: number
  currency: string
  direction: string
  status: string
  description: string | null
  created: string
  customer: string | null
  customer_name: string | null
  source: string | null
  destination_type: string | null
  destination_label: string | null
  transfer: string | null
  checkout_session: string | null
}

type Detail = {
  id: string
  type: string
  amount: number
  currency: string
  direction: string
  status: string
  description: string | null
  created: string
  metadata: Record<string, unknown>
  rail: string
  incoming: boolean
  customer: string | null
  customer_name: string | null
  transfer: { id: string; status: string; next_action?: { url?: string } | null } | null
  destination: { id: string; type: string } | null
  checkout_session: string | null
  account: string | null
}

export function PlatformTransactionsPage() {
  const { livemode } = useConsoleLivemode()
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedId = searchParams.get("id")
  const [q, setQ] = useState("")
  const [type, setType] = useState("all")

  const query = useQuery({
    queryKey: ["platform-transactions", livemode, q, type],
    queryFn: async () => {
      const search = new URLSearchParams({ livemode })
      if (q.trim()) search.set("q", q.trim())
      if (type !== "all") search.set("type", type)
      const res = await fetchWithSession(`/api/platform/transactions?${search}`)
      const body = (await res.json().catch(() => ({}))) as { transactions?: Row[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load payments")
      return body.transactions ?? []
    },
  })

  const detail = useQuery({
    queryKey: ["platform-transaction", selectedId, livemode],
    enabled: Boolean(selectedId),
    queryFn: async (): Promise<Detail> => {
      const res = await fetchWithSession(`/api/platform/transactions/${selectedId}?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as { transaction?: Detail; error?: string }
      if (!res.ok || !body.transaction) throw new Error(body.error || "Could not load payment")
      return body.transaction
    },
  })

  const close = () => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete("id")
    const qs = next.toString()
    router.replace(qs ? `/transactions?${qs}` : "/transactions", { scroll: false })
  }

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title={PAGE_COPY.consoleTransactions.title}
        description={PAGE_COPY.consoleTransactions.intro}
      />
      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search id, customer, rail…"
          className="h-8 max-w-xs text-xs"
        />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="deposit">Deposit</SelectItem>
            <SelectItem value="chain">Chain</SelectItem>
            <SelectItem value="onramp">Onramp</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
            <SelectItem value="checkout">Checkout</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          {(query.data ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{PAGE_COPY.consoleTransactions.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b">
                  <tr>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Source</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Destination</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Customer</th>
                    <th className="p-4 text-right text-xs font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(query.data ?? []).map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                      onClick={() => router.push(`/transactions?id=${row.id}`)}
                    >
                      <td className="p-4 text-sm font-medium">{row.type}</td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">{row.source || "—"}</td>
                      <td className="p-4 text-xs text-muted-foreground">{row.destination_label || "—"}</td>
                      <td className="p-4 text-sm">{row.customer_name || row.customer || "—"}</td>
                      <td className="p-4 text-right text-sm font-medium">
                        {row.direction === "out" ? "−" : "+"}
                        {formatCurrency(row.amount / 100, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && close()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">{selectedId}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {detail.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : detail.isError ? (
              <p className="text-sm text-destructive">
                {detail.error instanceof Error ? detail.error.message : "Could not load payment"}
              </p>
            ) : detail.data ? (
              <Tabs defaultValue="details">
                <TabsList>
                  <TabsTrigger value="details">Payment details</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="api">API</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="space-y-3 pt-4 text-sm">
                  <p>{detail.data.rail}</p>
                  <p>
                    {detail.data.incoming ? "Incoming" : "Outgoing"} · {detail.data.status} ·{" "}
                    {formatCurrency(detail.data.amount / 100, detail.data.currency)}
                  </p>
                  {detail.data.customer ? (
                    <p>
                      Customer{" "}
                      <Link href={`/customers/${detail.data.customer}`} className="underline underline-offset-2">
                        {detail.data.customer_name || detail.data.customer}
                      </Link>
                    </p>
                  ) : null}
                  {detail.data.account ? (
                    <p>
                      Account <CopyId id={detail.data.account} />
                    </p>
                  ) : null}
                  {detail.data.transfer ? (
                    <p>
                      Transfer <CopyId id={detail.data.transfer.id} /> · {detail.data.transfer.status}
                    </p>
                  ) : null}
                  {detail.data.destination ? (
                    <p>
                      Destination {detail.data.destination.type} <CopyId id={detail.data.destination.id} />
                    </p>
                  ) : null}
                  {detail.data.checkout_session ? (
                    <p>
                      Checkout <CopyId id={detail.data.checkout_session} />
                    </p>
                  ) : null}
                  {detail.data.transfer?.next_action?.url ? (
                    <p className="text-xs text-muted-foreground">
                      Requires customer authorization. Console does not confirm sends.
                    </p>
                  ) : null}
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href={`/console/explorer?endpoint=transactions.retrieve&id=${detail.data.id}`}>
                      Open in Workbench
                    </Link>
                  </Button>
                </TabsContent>
                <TabsContent value="timeline" className="pt-4 text-sm text-muted-foreground">
                  Created {new Date(detail.data.created).toLocaleString()} · {detail.data.status}
                </TabsContent>
                <TabsContent value="api" className="pt-4">
                  <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
                    {JSON.stringify(detail.data, null, 2)}
                  </pre>
                </TabsContent>
              </Tabs>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
