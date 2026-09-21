"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { formatMoneyDisplay } from "@easner/shared"
import { Card, CardContent } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CopyId } from "@/components/console/copy-id"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import Link from "next/link"

type SessionRow = {
  id: string
  status: string
  amountCents: number
  currency: string
  customerEmail: string | null
  createdAt: string
  origin: string | null
  source: string
}

type SessionDetail = {
  session: {
    id: string
    status: string
    amountCents: number
    currency: string
    customerEmail: string | null
    metadata: Record<string, unknown>
    createdAt: string
  }
  events: { id: string; type: string; created_at: string }[]
  deliveries: { id: string; status: string; last_status_code: number | null }[]
  transactions: { id: string; type: string; amount: number; currency: string }[]
}

export function CheckoutSessionsTable() {
  const { livemode } = useConsoleLivemode()
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedId = searchParams.get("session")

  const query = useQuery({
    queryKey: ["checkout-sessions", livemode],
    queryFn: async () => {
      const res = await fetchWithSession(`/api/checkout/test-payments?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as { sessions?: SessionRow[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load sessions")
      return body.sessions ?? []
    },
  })

  const detail = useQuery({
    queryKey: ["checkout-session", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async (): Promise<SessionDetail> => {
      const res = await fetchWithSession(`/api/checkout/sessions/${selectedId}`)
      const body = (await res.json().catch(() => ({}))) as SessionDetail & { error?: string }
      if (!res.ok || !body.session) throw new Error(body.error || "Could not load session")
      return body
    },
  })

  const close = () => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete("session")
    const qs = next.toString()
    router.replace(qs ? `/checkout?${qs}` : "/checkout", { scroll: false })
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {(query.data ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No Checkout sessions in this mode yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b">
                  <tr>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Session</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Email</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {(query.data ?? []).map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                      onClick={() => router.push(`/checkout?session=${encodeURIComponent(row.id)}`)}
                    >
                      <td className="p-4 font-mono text-xs">{row.id}</td>
                      <td className="p-4 text-sm">{row.status}</td>
                      <td className="p-4 text-sm font-medium">
                        {formatMoneyDisplay(row.amountCents / 100, row.currency)}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{row.customerEmail || "–"}</td>
                      <td className="p-4 text-xs text-muted-foreground">{row.origin || "–"}</td>
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
            ) : detail.data ? (
              <Tabs defaultValue="meta">
                <TabsList>
                  <TabsTrigger value="meta">Metadata</TabsTrigger>
                  <TabsTrigger value="events">Events</TabsTrigger>
                  <TabsTrigger value="payments">Payments</TabsTrigger>
                </TabsList>
                <TabsContent value="meta" className="space-y-3 pt-4">
                  <CopyId id={detail.data.session.id} />
                  <p className="text-sm">
                    {detail.data.session.status} ·{" "}
                    {formatMoneyDisplay(detail.data.session.amountCents / 100, detail.data.session.currency)}
                  </p>
                  <p className="text-sm text-muted-foreground">{detail.data.session.customerEmail || "No email"}</p>
                  <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
                    {JSON.stringify(detail.data.session.metadata, null, 2)}
                  </pre>
                </TabsContent>
                <TabsContent value="events" className="space-y-3 pt-4">
                  {(detail.data.events ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No checkout.completed events yet.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {detail.data.events.map((event) => (
                        <li key={event.id}>
                          {event.type} · {new Date(event.created_at).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(detail.data.deliveries ?? []).length > 0 ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {detail.data.deliveries.map((delivery) => (
                        <li key={delivery.id}>
                          Delivery {delivery.status}
                          {delivery.last_status_code ? ` · HTTP ${delivery.last_status_code}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </TabsContent>
                <TabsContent value="payments" className="pt-4">
                  {(detail.data.transactions ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No related merchant payment yet.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {detail.data.transactions.map((txn) => (
                        <li key={txn.id}>
                          <Link href={`/transactions?id=${txn.id}`} className="underline underline-offset-2">
                            {txn.id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <p className="text-sm text-muted-foreground">Session not found.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}


