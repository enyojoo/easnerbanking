"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { consoleLivemodeQuery, parseConsoleLivemode } from "@/lib/console/livemode"
import { fetchWithSession } from "@/lib/fetch-with-session"

type Customer = {
  id: string
  email: string | null
  name: string | null
  status: string
  created: string
}

export default function PlatformCustomersPage() {
  const livemode = parseConsoleLivemode(useSearchParams().get("livemode"))
  const query = useQuery({
    queryKey: ["platform-customers", livemode],
    queryFn: async () => {
      const res = await fetchWithSession(`/api/platform/customers?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as { customers?: Customer[]; error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load customers")
      return body.customers ?? []
    },
  })

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title={PAGE_COPY.consoleCustomers.title}
        description={PAGE_COPY.consoleCustomers.intro}
      />
      <Card>
        <CardContent className="p-0">
          {(query.data ?? []).length === 0 ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {PAGE_COPY.consoleCustomers.empty}
            </div>
          ) : (
            <ul className="divide-y">
              {(query.data ?? []).map((customer) => (
                <li key={customer.id}>
                  <Link
                    href={`/customers/${customer.id}${consoleLivemodeQuery(livemode)}`}
                    className="block px-5 py-4 transition-colors hover:bg-muted/50"
                  >
                    <p className="text-sm font-medium">{customer.name || customer.email || customer.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.id} · {customer.status} · {new Date(customer.created).toLocaleString()}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
