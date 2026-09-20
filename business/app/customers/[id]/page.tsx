"use client"

import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
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

type Customer = {
  id: string
  email: string | null
  name: string | null
  external_id: string | null
  status: string
  created: string
}

export default function PlatformCustomerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const livemode = parseConsoleLivemode(useSearchParams().get("livemode"))
  const query = useQuery({
    queryKey: ["platform-customer", id, livemode],
    queryFn: async () => {
      const res = await fetchWithSession(`/api/platform/customers/${id}?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as {
        customer?: Customer
        accounts?: Account[]
        transactions?: Transaction[]
        error?: string
      }
      if (res.status === 404) throw new Error("not_found")
      if (!res.ok) throw new Error(body.error || "Could not load customer")
      return {
        customer: body.customer,
        accounts: body.accounts ?? [],
        transactions: body.transactions ?? [],
      }
    },
  })

  const customer = query.data?.customer
  const title = customer?.name || customer?.email || PAGE_COPY.consoleCustomer.title

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href={`/customers${consoleLivemodeQuery(livemode)}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {PAGE_COPY.consoleCustomers.title}
        </Link>
        <ConsolePageHeader title={title} description={PAGE_COPY.consoleCustomer.intro} />
      </div>

      {query.isError && query.error instanceof Error && query.error.message === "not_found" ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {PAGE_COPY.consoleCustomer.notFound}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-1 p-6">
              <p className="text-sm font-medium">{customer?.email || customer?.id || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {customer?.id}
                {customer?.status ? ` · ${customer.status}` : ""}
                {customer?.external_id ? ` · ${customer.external_id}` : ""}
                {customer?.created ? ` · ${new Date(customer.created).toLocaleString()}` : ""}
              </p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{PAGE_COPY.consoleCustomer.accounts}</h3>
            <Card>
              <CardContent className="p-0">
                {(query.data?.accounts ?? []).length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    {PAGE_COPY.consoleCustomer.accountsEmpty}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {(query.data?.accounts ?? []).map((account) => (
                      <li key={account.id} className="flex items-center justify-between gap-3 px-5 py-4">
                        <div>
                          <p className="text-sm font-medium">{account.currency}</p>
                          <p className="text-xs text-muted-foreground">{account.id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {formatCurrency(account.available / 100, account.currency)}
                          </p>
                          {account.pending > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Pending {formatCurrency(account.pending / 100, account.currency)}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{PAGE_COPY.consoleCustomer.activity}</h3>
            <Card>
              <CardContent className="p-0">
                {(query.data?.transactions ?? []).length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    {PAGE_COPY.consoleCustomer.activityEmpty}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {(query.data?.transactions ?? []).map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-4">
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
        </>
      )}
    </div>
  )
}
