"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { Archive, ArchiveRestore, Copy, Link2, MoreHorizontal, Plus, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { CreatePaymentLinkDialog } from "@/components/links/create-payment-link-dialog"
import { PaymentLinkShareSheet } from "@/components/links/payment-link-share-sheet"
import { CollectionsPageHeader } from "@/components/collections/collections-page-header"
import { CollectionsReadinessBanner } from "@/components/collections/collections-readiness-banner"
import { PaymentLinksListSkeleton } from "@/components/collections/collections-skeletons"
import { usePaymentLinks, type PaymentLinkListRow } from "@/hooks/use-payment-links"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { paymentLinkTypeLabel } from "@/lib/payment-links/types"
import type { PaymentLinkRail } from "@/lib/payment-links/types"
import { COLLECTIONS_COPY, PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { formatCurrency } from "@/lib/utils"

type LinkTab = "all" | "active" | "closed"

function matchesTab(row: PaymentLinkListRow, tab: LinkTab): boolean {
  if (tab === "active") return !row.archivedAt
  if (tab === "closed") return Boolean(row.archivedAt)
  return true
}

export function PaymentLinksPage({ initialCreateRail }: { initialCreateRail?: PaymentLinkRail }) {
  const [tab, setTab] = useState<LinkTab>("all")
  const [search, setSearch] = useState("")
  const { links, easetag, loading, refetch } = usePaymentLinks({ includeArchived: true })
  const [createOpen, setCreateOpen] = useState(Boolean(initialCreateRail))
  const [shareLink, setShareLink] = useState<PaymentLinkListRow | null>(null)

  const copyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied")
    } catch {
      toast.error("Could not copy")
    }
  }, [])

  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      const res = await fetchWithSession(`/api/payment-links/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || (archived ? "Could not close link." : "Could not reopen link."))
        return
      }
      toast.success(archived ? "Link closed." : "Link reopened.")
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
  const statusTabs = [
    { id: "all" as const, label: COLLECTIONS_COPY.tabAll, count: links.length },
    { id: "active" as const, label: COLLECTIONS_COPY.chipActive, count: activeCount },
    { id: "closed" as const, label: COLLECTIONS_COPY.chipClosed, count: closedCount },
  ]

  const createButton = (
    <Button type="button" className="gap-2" onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      {COLLECTIONS_COPY.createLink}
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <CollectionsReadinessBanner />
      <CollectionsPageHeader
        title={PAGE_COPY.links.title}
        intro={PAGE_COPY.links.intro}
        actions={createButton}
      />

      {links.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex space-x-1 overflow-x-auto">
            {statusTabs.map((item) => (
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
            placeholder={COLLECTIONS_COPY.searchPlaceholder}
            className="max-w-md"
          />
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <PaymentLinksListSkeleton />
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Link2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">{COLLECTIONS_COPY.emptyTitle}</p>
              <p className="max-w-md text-sm text-muted-foreground">{COLLECTIONS_COPY.emptyBody}</p>
              {createButton}
              <p className="mt-2 text-xs text-muted-foreground">
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
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {search.trim()
                ? COLLECTIONS_COPY.emptySearchLinks
                : tab === "closed"
                  ? COLLECTIONS_COPY.emptyClosedLinks
                  : tab === "active"
                    ? COLLECTIONS_COPY.emptyActiveLinks
                    : COLLECTIONS_COPY.emptySearchLinks}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] table-fixed">
                <colgroup>
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead className="border-b">
                  <tr>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnLink}
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnType}
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnAmount}
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      {COLLECTIONS_COPY.columnPayments}
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const collected =
                      row.totalCollectedCents != null
                        ? formatCurrency(row.totalCollectedCents / 100, row.currency)
                        : null
                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                        onClick={() => setShareLink(row)}
                      >
                        <td className="min-w-0 p-4 align-middle">
                          <span className="block truncate text-sm font-medium">{row.label}</span>
                          <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                            {row.url.replace(/^https?:\/\//, "")}
                          </span>
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {paymentLinkTypeLabel(row)}
                        </td>
                        <td className="p-4 align-middle text-sm tabular-nums">
                          {formatCurrency(row.amountCents / 100, row.currency)}
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {row.paymentCount}
                          {collected ? (
                            <span className="block truncate text-xs tabular-nums">{collected}</span>
                          ) : null}
                        </td>
                        <td className="p-4 align-middle text-sm">
                          {row.archivedAt ? COLLECTIONS_COPY.chipClosed : COLLECTIONS_COPY.chipActive}
                        </td>
                        <td className="p-4 align-middle" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" aria-label="Link actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setShareLink(row)}>
                                <Share2 className="mr-2 h-4 w-4" />
                                {COLLECTIONS_COPY.share}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void copyUrl(row.url)}>
                                <Copy className="mr-2 h-4 w-4" />
                                {COLLECTIONS_COPY.copyLink}
                              </DropdownMenuItem>
                              {row.archivedAt ? (
                                <DropdownMenuItem onClick={() => void setArchived(row.id, false)}>
                                  <ArchiveRestore className="mr-2 h-4 w-4" />
                                  {COLLECTIONS_COPY.reopenLink}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => void setArchived(row.id, true)}
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  {COLLECTIONS_COPY.closeLink}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
        onArchived={() => {
          void refetch()
          setShareLink((prev) =>
            prev ? { ...prev, archivedAt: prev.archivedAt ? null : new Date().toISOString() } : null
          )
        }}
      />
    </div>
  )
}
