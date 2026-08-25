"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Globe, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { CollectionsPageHeader } from "@/components/collections/collections-page-header"
import { CollectionsReadinessBanner } from "@/components/collections/collections-readiness-banner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CheckoutSitesTableSkeleton } from "@/components/collections/collections-skeletons"
import { CheckoutTestPaymentsDialog } from "@/components/checkout/checkout-test-payments-dialog"
import { deleteCheckoutSite, useCheckoutSettings } from "@/hooks/use-checkout-settings"
import { COLLECTIONS_COPY, PAGE_COPY } from "@/lib/copy/business-ui-copy"

export function CheckoutSitesPage() {
  const router = useRouter()
  const { data, loading, error, refetch } = useCheckoutSettings()
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [testPaymentsOpen, setTestPaymentsOpen] = useState(false)
  const sites = data?.sites ?? []
  const [tab, setTab] = useState<"all" | "incomplete">("all")
  const [search, setSearch] = useState("")
  const incompleteCount = sites.filter((site) => !site.successUrl).length
  const visibleSites = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sites.filter((site) => {
      if (tab === "incomplete" && site.successUrl) return false
      if (!q) return true
      return `${site.origin} ${site.successUrl ?? ""} ${site.cancelUrl ?? ""}`.toLowerCase().includes(q)
    })
  }, [sites, tab, search])

  const createButton = (
    <Button asChild>
      <Link href="/checkout/new">
        <Plus className="mr-2 h-4 w-4" />
        {COLLECTIONS_COPY.createWebsite}
      </Link>
    </Button>
  )

  const remove = async () => {
    if (!removeId) return
    setRemoving(true)
    try {
      const result = await deleteCheckoutSite(removeId)
      if (!result.ok) {
        toast.error(result.error || "Could not remove website")
        return
      }
      toast.success("Website removed.")
      setRemoveId(null)
      await refetch()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <CollectionsReadinessBanner />
      <div className="flex flex-col gap-4">
        <CollectionsPageHeader
          title={PAGE_COPY.checkout.title}
          intro={PAGE_COPY.checkout.intro}
          actions={
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-muted-foreground lg:text-right">
                {COLLECTIONS_COPY.notBuildingSite}{" "}
                <Link href="/links" className="underline underline-offset-2">
                  {COLLECTIONS_COPY.openPaymentLinks}
                </Link>
              </p>
              <Button type="button" variant="outline" onClick={() => setTestPaymentsOpen(true)}>
                {COLLECTIONS_COPY.viewTestPayments}
              </Button>
              {createButton}
            </div>
          }
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="status">
          {error}
        </p>
      ) : null}

      {sites.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 space-x-1 overflow-x-auto">
            {(
              [
                { id: "all" as const, label: COLLECTIONS_COPY.tabAll, count: sites.length },
                { id: "incomplete" as const, label: COLLECTIONS_COPY.tabIncomplete, count: incompleteCount },
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === item.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
                {item.count > 0 ? (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{item.count}</span>
                ) : null}
              </button>
            ))}
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={COLLECTIONS_COPY.searchWebsites}
            className="w-full max-w-[220px] shrink-0 sm:max-w-xs"
          />
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <CheckoutSitesTableSkeleton />
          ) : sites.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Globe className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mb-1 text-sm font-medium">{COLLECTIONS_COPY.emptyWebsitesTitle}</p>
                <p className="mb-4 text-sm text-muted-foreground">{COLLECTIONS_COPY.emptyWebsitesBody}</p>
                {createButton}
              </div>
            </div>
          ) : visibleSites.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {search.trim()
                ? COLLECTIONS_COPY.emptySearchWebsites
                : COLLECTIONS_COPY.emptyIncomplete}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed">
                <colgroup>
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead className="border-b">
                  <tr>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnWebsite}
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnSuccess}
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnCancel}
                    </th>
                    <th className="p-4 text-right text-xs font-medium text-muted-foreground"> </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSites.map((site) => (
                    <tr
                      key={site.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                      onMouseEnter={() => void router.prefetch(`/checkout/${site.id}`)}
                      onClick={() => router.push(`/checkout/${site.id}`)}
                    >
                      <td className="truncate p-4 font-mono text-xs">{site.origin}</td>
                      <td className="truncate p-4 text-sm text-muted-foreground">
                        {site.successUrl || "–"}
                      </td>
                      <td className="truncate p-4 text-sm text-muted-foreground">
                        {site.cancelUrl || "–"}
                      </td>
                      <td className="p-4 text-right" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/checkout/${site.id}`} aria-label={COLLECTIONS_COPY.editWebsite}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={COLLECTIONS_COPY.removeWebsite}
                            onClick={() => setRemoveId(site.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CheckoutTestPaymentsDialog open={testPaymentsOpen} onOpenChange={setTestPaymentsOpen} />

      <AlertDialog open={Boolean(removeId)} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{COLLECTIONS_COPY.removeWebsiteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{COLLECTIONS_COPY.removeWebsiteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault()
                void remove()
              }}
            >
              {removing ? "Removing…" : COLLECTIONS_COPY.removeWebsite}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
