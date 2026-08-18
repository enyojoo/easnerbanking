"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Archive, Copy, Plus, Share2 } from "lucide-react"
import { CreatePaymentLinkDialog } from "@/components/links/create-payment-link-dialog"
import { PaymentLinkShareSheet } from "@/components/links/payment-link-share-sheet"
import { usePaymentLinks, type PaymentLinkListRow } from "@/hooks/use-payment-links"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { paymentLinkTypeLabel, type PaymentLinkRail } from "@/lib/payment-links/types"
import { formatCurrency, formatDate } from "@/lib/utils"

/** `initialCreateRail` opens the create flow straight away for deep links such as /links/create. */
export function PaymentLinksPage({ initialCreateRail }: { initialCreateRail?: PaymentLinkRail }) {
  const [showArchived, setShowArchived] = useState(false)
  const { links, easetag, loading, refetch } = usePaymentLinks({ includeArchived: showArchived })
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

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-4 border-b bg-background pb-4">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Payment Links</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Share a link or a printed code and get paid by card, bank, or stablecoin — no invoice
              needed. Money lands in your Easner Balance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide closed" : "Show closed"}
            </Button>
            <Button type="button" size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Create link
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              <div className="h-16 animate-pulse rounded-md bg-muted" />
              <div className="h-16 animate-pulse rounded-md bg-muted" />
              <div className="h-16 animate-pulse rounded-md bg-muted" />
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-lg font-semibold">Get paid without an invoice</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Create a link for a one-time payment, a recurring plan, or a stablecoin deposit
                code. Share it anywhere — payments settle into your Easner Balance.
              </p>
              <Button type="button" className="mt-2 gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Create your first link
              </Button>
              <dl className="mt-6 grid max-w-xl gap-2 text-left text-xs text-muted-foreground sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <dt className="font-medium text-foreground">Share a link or code</dt>
                  <dd className="mt-1">Payment Links — no developer needed.</dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="font-medium text-foreground">Sell on your website</dt>
                  <dd className="mt-1">
                    <Link href="/checkout" className="underline underline-offset-2">
                      Online Checkout
                    </Link>{" "}
                    — add the payment form to your own pages.
                  </dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="font-medium text-foreground">Bill a known customer</dt>
                  <dd className="mt-1">
                    <Link href="/invoices" className="underline underline-offset-2">
                      Invoices
                    </Link>{" "}
                    — due dates, reminders, receipts.
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="min-h-0 overflow-auto">
              <table className="w-full min-w-[960px] table-fixed">
                <thead className="border-b">
                  <tr>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="w-40 p-4 text-left text-xs font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="w-32 p-4 text-left text-xs font-medium text-muted-foreground">
                      Amount
                    </th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Link</th>
                    <th className="w-24 p-4 text-left text-xs font-medium text-muted-foreground">
                      Payments
                    </th>
                    <th className="w-28 p-4 text-left text-xs font-medium text-muted-foreground">
                      Created
                    </th>
                    <th className="w-40 p-4 text-right text-xs font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {links.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/40">
                      <td className="min-w-0 p-4">
                        <span className="block truncate text-sm font-medium">{row.label}</span>
                        {row.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.description}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-4 text-sm">
                        {paymentLinkTypeLabel(row)}
                        {row.archivedAt ? (
                          <Badge variant="secondary" className="ml-2">
                            Closed
                          </Badge>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap p-4 text-sm tabular-nums">
                        {formatCurrency(row.amountCents / 100, row.currency)}
                      </td>
                      <td className="min-w-0 p-4">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => void copyUrl(row.url)}
                        >
                          {row.url.replace(/^https?:\/\//, "")}
                        </button>
                      </td>
                      <td className="p-4 text-sm tabular-nums">{row.paymentCount}</td>
                      <td className="whitespace-nowrap p-4 text-xs text-muted-foreground">
                        {row.createdAt ? formatDate(row.createdAt) : "—"}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => setShareLink(row)}
                          >
                            <Share2 className="h-3.5 w-3.5" aria-hidden />
                            Share
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => void copyUrl(row.url)}
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          {row.archivedAt ? null : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 text-destructive"
                              onClick={() => void archive(row.id)}
                            >
                              <Archive className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          )}
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
    </div>
  )
}
