"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { CreatePaymentLinkDialog } from "@/components/links/create-payment-link-dialog"
import { PaymentLinkCard } from "@/components/links/payment-link-card"
import { PaymentLinkDetailSheet } from "@/components/links/payment-link-detail-sheet"
import { PaymentLinkShareSheet } from "@/components/links/payment-link-share-sheet"
import { CollectionsPageHeader } from "@/components/collections/collections-page-header"
import { CollectionsReadinessBanner } from "@/components/collections/collections-readiness-banner"
import { PaymentLinksListSkeleton } from "@/components/collections/collections-skeletons"
import { usePaymentLinks, type PaymentLinkListRow } from "@/hooks/use-payment-links"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { PaymentLinkRail } from "@/lib/payment-links/types"
import { COLLECTIONS_COPY, PAGE_COPY } from "@/lib/copy/business-ui-copy"

type LinkTab = "all" | "one_time" | "recurring" | "stablecoin"

function matchesTab(row: PaymentLinkListRow, tab: LinkTab): boolean {
  if (tab === "all") return true
  if (tab === "stablecoin") return row.rail === "stablecoin"
  if (tab === "recurring") return row.rail === "card_bank" && row.mode === "subscription"
  return row.rail === "card_bank" && row.mode === "one_time"
}

export function PaymentLinksPage({ initialCreateRail }: { initialCreateRail?: PaymentLinkRail }) {
  const [showArchived, setShowArchived] = useState(false)
  const [tab, setTab] = useState<LinkTab>("all")
  const [search, setSearch] = useState("")
  const { links, easetag, loading, refetch } = usePaymentLinks({ includeArchived: showArchived })
  const [createOpen, setCreateOpen] = useState(Boolean(initialCreateRail))
  const [shareLink, setShareLink] = useState<PaymentLinkListRow | null>(null)
  const [detailLink, setDetailLink] = useState<PaymentLinkListRow | null>(null)

  const copyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied")
    } catch {
      toast.error("Could not copy")
    }
  }, [])

  const archive = useCallback(
    async (id: string) => {
      const res = await fetchWithSession(`/api/payment-links/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not close link.")
        return
      }
      toast.success("Link closed.")
      void refetch()
    },
    [refetch],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return links.filter((row) => {
      if (!matchesTab(row, tab)) return false
      if (!q) return true
      return `${row.label} ${row.slug} ${row.url}`.toLowerCase().includes(q)
    })
  }, [links, search, tab])

  const activeCount = links.filter((row) => !row.archivedAt).length
  const closedCount = links.filter((row) => row.archivedAt).length
  const chips = links.length
    ? [
        `${COLLECTIONS_COPY.chipActive} ${activeCount}`,
        `${COLLECTIONS_COPY.chipClosed} ${closedCount}`,
        `${COLLECTIONS_COPY.chipTotal} ${links.length}`,
      ]
    : undefined

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-4 border-b bg-background pb-4">
        <CollectionsPageHeader
          title={PAGE_COPY.links.title}
          intro={PAGE_COPY.links.intro}
          chips={chips}
          actions={
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? COLLECTIONS_COPY.hideClosed : COLLECTIONS_COPY.showClosed}
              </Button>
              <Button type="button" size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                {COLLECTIONS_COPY.createLink}
              </Button>
            </>
          }
        />
        <CollectionsReadinessBanner />
      </div>

      {loading ? (
        <PaymentLinksListSkeleton />
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-lg font-semibold">{COLLECTIONS_COPY.emptyTitle}</p>
          <p className="max-w-md text-sm text-muted-foreground">{COLLECTIONS_COPY.emptyBody}</p>
          <Button type="button" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {COLLECTIONS_COPY.emptyCta}
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            {COLLECTIONS_COPY.otherWays}:{" "}
            <Link href="/invoices" className="underline underline-offset-2">
              {COLLECTIONS_COPY.otherInvoices}
            </Link>
            {" · "}
            <Link href="/checkout" className="underline underline-offset-2">
              {COLLECTIONS_COPY.otherCheckout}
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={tab} onValueChange={(value) => setTab(value as LinkTab)}>
              <TabsList>
                <TabsTrigger value="all">{COLLECTIONS_COPY.tabAll}</TabsTrigger>
                <TabsTrigger value="one_time">{COLLECTIONS_COPY.tabOneTime}</TabsTrigger>
                <TabsTrigger value="recurring">{COLLECTIONS_COPY.tabRecurring}</TabsTrigger>
                <TabsTrigger value="stablecoin">{COLLECTIONS_COPY.tabStablecoin}</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={COLLECTIONS_COPY.searchPlaceholder}
              className="sm:max-w-xs"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{COLLECTIONS_COPY.emptyTitle}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((row) => (
                <PaymentLinkCard
                  key={row.id}
                  row={row}
                  onOpen={() => setDetailLink(row)}
                  onShare={() => setShareLink(row)}
                  onCopy={() => void copyUrl(row.url)}
                  onArchive={() => void archive(row.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <CreatePaymentLinkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        easetag={easetag}
        initialRail={initialCreateRail}
        onCreated={(link) => {
          void refetch()
          setShareLink(link)
        }}
      />

      <PaymentLinkShareSheet
        link={shareLink}
        easetag={easetag}
        onOpenChange={(open) => {
          if (!open) setShareLink(null)
        }}
        onArchived={() => void refetch()}
      />

      <PaymentLinkDetailSheet
        link={detailLink}
        onOpenChange={(open) => {
          if (!open) setDetailLink(null)
        }}
        onShare={() => {
          if (detailLink) setShareLink(detailLink)
        }}
      />
    </div>
  )
}
