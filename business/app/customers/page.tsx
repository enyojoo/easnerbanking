"use client"

import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { PageIntro } from "@/components/copy/page-intro"
import { ConsoleModeSwitch } from "@/components/console/console-mode-switch"
import { parseConsoleLivemode } from "@/lib/console/livemode"
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageIntro
          title="Customers"
          description="API customers. Each has an isolated wallet, the same shape as an Easner user."
          variant="page"
        />
        <ConsoleModeSwitch />
      </div>
      <Card>
        <CardContent className="p-0">
          {(query.data ?? []).length === 0 ? (
            <div className="flex flex-col gap-2 p-6 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                No API customers yet.
              </p>
              <p>Create them with POST /v1/customers. Invoice customers stay in Banking.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {(query.data ?? []).map((customer) => (
                <li key={customer.id} className="px-5 py-4">
                  <p className="text-sm font-medium">{customer.name || customer.email || customer.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {customer.id} · {customer.status} · {new Date(customer.created).toLocaleString()}
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
