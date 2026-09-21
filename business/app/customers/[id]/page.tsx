"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { CopyId } from "@/components/console/copy-id"
import { ReceiveRailsPanel } from "@/components/console/receive-rails-panel"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { cn, formatCurrency } from "@/lib/utils"

type Account = {
  id: string
  currency: string
  available: number
  pending: number
}

type Transaction = {
  id: string
  type: string
  amount: number
  currency: string
  direction: string
  status: string
  description: string | null
  created: string
}

type Destination = {
  id: string
  type: string
  details: Record<string, unknown>
}

type Customer = {
  id: string
  email: string | null
  name: string | null
  external_id: string | null
  easetag: string | null
  status: string
  verification_status: string
  created: string
}

type Tab = "overview" | "verification" | "accounts" | "rails" | "destinations" | "payments" | "events"

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "verification", label: "Verification" },
  { id: "accounts", label: "Accounts" },
  { id: "rails", label: "Receive rails" },
  { id: "destinations", label: "Destinations" },
  { id: "payments", label: "Payments" },
  { id: "events", label: "Events" },
]

function maskDestination(type: string, details: Record<string, unknown>) {
  if (type === "bank") {
    const acct = String(details.account_number ?? details.iban ?? "")
    return acct ? `••••${acct.slice(-4)}` : type
  }
  if (type === "wallet") {
    const address = String(details.address ?? "")
    return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : type
  }
  if (type === "easetag") return String(details.easetag ?? details.handle ?? type)
  if (type === "mobile_money") {
    const phone = String(details.phone ?? details.msisdn ?? "")
    return phone ? `••••${phone.slice(-4)}` : type
  }
  return type
}

export default function PlatformCustomerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { livemode } = useConsoleLivemode()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>("overview")
  const [starting, setStarting] = useState(false)
  const query = useQuery({
    queryKey: ["platform-customer", id, livemode],
    queryFn: async () => {
      const res = await fetchWithSession(`/api/platform/customers/${id}?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as {
        customer?: Customer
        accounts?: Account[]
        transactions?: Transaction[]
        destinations?: Destination[]
        error?: string
      }
      if (res.status === 404) throw new Error("not_found")
      if (!res.ok) throw new Error(body.error || "Could not load customer")
      return {
        customer: body.customer,
        accounts: body.accounts ?? [],
        transactions: body.transactions ?? [],
        destinations: body.destinations ?? [],
      }
    },
  })

  const events = useQuery({
    queryKey: ["platform-events", livemode, id],
    enabled: tab === "events",
    queryFn: async () => {
      const res = await fetchWithSession(`/api/platform/events?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as { events?: { id: string; type: string; payload: Record<string, unknown>; created_at: string }[] }
      if (!res.ok) throw new Error("Could not load events")
      return (body.events ?? []).filter((event) => JSON.stringify(event.payload).includes(id))
    },
  })

  const customer = query.data?.customer
  const title = customer?.name || customer?.email || PAGE_COPY.consoleCustomer.title
  const accounts = query.data?.accounts ?? []

  const startVerification = async () => {
    setStarting(true)
    try {
      const res = await fetchWithSession(`/api/platform/customers/${id}/verification?livemode=${livemode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const body = (await res.json().catch(() => ({}))) as { status?: string; url?: string | null; error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not start verification")
        return
      }
      toast.success(body.status === "approved" ? "Test verification approved." : "Verification started.")
      if (body.url) window.open(body.url, "_blank", "noopener,noreferrer")
      await queryClient.invalidateQueries({ queryKey: ["platform-customer", id, livemode] })
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {PAGE_COPY.consoleCustomers.title}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ConsolePageHeader title={title} description={PAGE_COPY.consoleCustomer.intro} />
          {customer ? (
            <div className="flex flex-wrap items-center gap-2">
              <CopyId id={customer.id} />
              <Badge variant={customer.verification_status === "approved" ? "emerald" : "slate"}>
                {customer.verification_status}
              </Badge>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`/console/explorer?endpoint=customers.retrieve&id=${customer.id}`}>Open in Workbench</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {query.isError && query.error instanceof Error && query.error.message === "not_found" ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{PAGE_COPY.consoleCustomer.notFound}</CardContent>
        </Card>
      ) : (
        <>
          <div className="flex min-w-0 space-x-1 overflow-x-auto border-b">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                  tab === item.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <Card>
              <CardContent className="space-y-1 p-6">
                <p className="text-sm font-medium">{customer?.email || customer?.id || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {customer?.external_id ? `${customer.external_id} · ` : ""}
                  {customer?.easetag ? `${customer.easetag} · ` : ""}
                  {customer?.created ? new Date(customer.created).toLocaleString() : ""}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {tab === "verification" ? (
            <Card>
              <CardContent className="space-y-3 p-6">
                <p className="text-sm">Status: {customer?.verification_status ?? "unverified"}</p>
                <p className="text-sm text-muted-foreground">
                  {livemode === "test"
                    ? "Test approves immediately. No hosted form."
                    : "Live opens a hosted verification link."}
                </p>
                <Button type="button" size="sm" disabled={starting} onClick={() => void startVerification()}>
                  {starting ? "Starting…" : "Start verification"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {tab === "accounts" ? (
            <Card>
              <CardContent className="p-0">
                {accounts.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">{PAGE_COPY.consoleCustomer.accountsEmpty}</p>
                ) : (
                  <ul className="divide-y">
                    {accounts.map((account) => (
                      <li key={account.id}>
                        <Link
                          href={`/accounts?id=${account.id}`}
                          className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {account.currency === "USD" ? "USDC" : account.currency === "EUR" ? "EURC" : account.currency}
                            </p>
                            <CopyId id={account.id} />
                          </div>
                          <p className="text-sm font-medium">
                            {formatCurrency(account.available / 100, account.currency)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "rails" ? (
            accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Issue an account first.</p>
            ) : (
              <div className="space-y-8">
                {accounts.map((account) => (
                  <div key={account.id} className="space-y-3">
                    <h3 className="text-sm font-medium">
                      {account.currency} · {account.id}
                    </h3>
                    <ReceiveRailsPanel
                      accountId={account.id}
                      currency={account.currency}
                      available={account.available}
                      pending={account.pending}
                      showSimulate
                    />
                  </div>
                ))}
              </div>
            )
          ) : null}

          {tab === "destinations" ? (
            <Card>
              <CardContent className="p-0">
                {(query.data?.destinations ?? []).length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No destinations yet.</p>
                ) : (
                  <ul className="divide-y">
                    {(query.data?.destinations ?? []).map((dest) => (
                      <li key={dest.id} className="flex items-center justify-between gap-3 px-5 py-4">
                        <div>
                          <p className="text-sm font-medium capitalize">{dest.type}</p>
                          <p className="text-xs text-muted-foreground">{maskDestination(dest.type, dest.details)}</p>
                        </div>
                        <CopyId id={dest.id} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "payments" ? (
            <Card>
              <CardContent className="p-0">
                {(query.data?.transactions ?? []).length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">{PAGE_COPY.consoleCustomer.activityEmpty}</p>
                ) : (
                  <ul className="divide-y">
                    {(query.data?.transactions ?? []).map((row) => (
                      <li key={row.id}>
                        <Link
                          href={`/transactions?id=${row.id}`}
                          className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50"
                        >
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
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "events" ? (
            <Card>
              <CardContent className="p-0">
                {(events.data ?? []).length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    {events.isPending ? "Loading…" : "No events for this customer yet."}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {(events.data ?? []).map((event) => (
                      <li key={event.id} className="flex items-center justify-between gap-3 px-5 py-4">
                        <code className="text-xs">{event.type}</code>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
