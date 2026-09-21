"use client"

import { type ReactNode, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { formatMoneyDisplay } from "@easner/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckoutIntegrationGuide } from "@/components/checkout/checkout-integration-guide"
import { CheckoutTestPaymentsSkeleton } from "@/components/collections/collections-skeletons"
import { useCheckoutTestPaymentsQuery } from "@/hooks/queries/use-checkout-test-payments-query"
import type { CheckoutSiteSetupStep } from "@/lib/checkout/checkout-phases"
import type { CheckoutHubPayload, CheckoutSite } from "@/lib/checkout/hub-types"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { cn } from "@/lib/utils"

type SiteTab = "payments" | "integrate" | "settings"

export function CheckoutSiteReadyView({
  data,
  site,
  onEditStep,
  liveSwitch,
}: {
  data: CheckoutHubPayload
  site: CheckoutSite
  onEditStep: (step: CheckoutSiteSetupStep) => void
  liveSwitch: ReactNode
}) {
  const { livemode } = useConsoleLivemode()
  const [tab, setTab] = useState<SiteTab>("payments")

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Checkout credits your business balance, not a customer vault.
      </p>
      <div className="flex min-w-0 space-x-1 overflow-x-auto border-b">
        {(
          [
            { id: "payments" as const, label: "Payments" },
            { id: "integrate" as const, label: "Integrate" },
            { id: "settings" as const, label: "Settings" },
          ]
        ).map((item) => (
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

      {tab === "payments" ? <CheckoutSitePayments livemode={livemode} siteId={site.id} /> : null}

      {tab === "integrate" ? (
        <div>
          <div className="mb-4 flex flex-wrap gap-3 text-sm">
            <Link href="/console/keys" className="underline underline-offset-2">
              API keys
            </Link>
            <Link href="/console/webhooks" className="underline underline-offset-2">
              Webhooks
            </Link>
          </div>
          <CheckoutIntegrationGuide data={data} />
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div>
                <p className="text-sm font-medium">Website</p>
                <p className="font-mono text-xs text-muted-foreground">{site.origin}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => onEditStep("website")}>
                Edit
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div>
                <p className="text-sm font-medium">Return URLs</p>
                <p className="text-xs text-muted-foreground">
                  {[site.successUrl || "No success URL", site.cancelUrl || "No cancel URL"].join(" · ")}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => onEditStep("urls")}>
                Edit
              </Button>
            </CardContent>
          </Card>
          {liveSwitch}
        </div>
      ) : null}
    </div>
  )
}

function CheckoutSitePayments({ livemode, siteId }: { livemode: "test" | "live"; siteId: string }) {
  const query = useCheckoutTestPaymentsQuery(true)
  const payments = query.data?.payments ?? []
  const loading = query.isPending && !query.data
  const [creating, setCreating] = useState(false)

  const createTestSession = async () => {
    setCreating(true)
    try {
      const res = await fetchWithSession("/api/checkout/test-session?livemode=test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, amount: 100 }),
      })
      const body = (await res.json().catch(() => ({}))) as { checkout_session_id?: string; error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not create test session")
        return
      }
      toast.success(`Created ${body.checkout_session_id}. Pay with 4242 on your site and watch webhooks.`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      {livemode === "test" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{COLLECTIONS_COPY.testOnYourWebsite}</p>
          <Button type="button" size="sm" disabled={creating} onClick={() => void createTestSession()}>
            {creating ? "Creating…" : "Create $1 test session"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Live Checkout payments credit your business balance.</p>
      )}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4">
              <CheckoutTestPaymentsSkeleton />
            </div>
          ) : payments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{COLLECTIONS_COPY.testPaymentsEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <thead className="border-b">
                  <tr>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnWhen}
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnAmount}
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnCustomer}
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnSource}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="p-4 text-sm text-muted-foreground">
                        {row.completedAt ? new Date(row.completedAt).toLocaleString() : "–"}
                      </td>
                      <td className="p-4 text-sm font-medium">
                        {formatMoneyDisplay(row.amountCents / 100, row.currency)}
                      </td>
                      <td className="truncate p-4 text-sm text-muted-foreground">{row.customerEmail || "–"}</td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {row.source === "payment_link"
                          ? COLLECTIONS_COPY.sourcePaymentLink
                          : COLLECTIONS_COPY.sourceEmbed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
