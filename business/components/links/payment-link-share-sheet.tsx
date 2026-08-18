"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import { Archive, Check, Copy, ExternalLink, FileText, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { paymentLinkTypeLabel } from "@/lib/payment-links/types"
import type { PaymentLinkListRow } from "@/hooks/use-payment-links"
import { formatCurrency } from "@/lib/utils"
import { useBusinessProfile } from "@/lib/use-business-profile"

export function PaymentLinkShareSheet({
  link,
  easetag,
  onOpenChange,
  onArchived,
}: {
  link: PaymentLinkListRow | null
  easetag: string | null
  onOpenChange: (open: boolean) => void
  onArchived: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const { name, logoUrl } = useBusinessProfile()

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
      toast.success("Link copied")
    } catch {
      toast.error("Could not copy")
    }
  }

  const downloadPlacard = async (format: "png" | "pdf") => {
    if (!link?.autopayoutConfigId) return
    const res = await fetchWithSession(
      `/api/autopayout/${encodeURIComponent(link.autopayoutConfigId)}/placard?format=${format}`,
    )
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!res.ok || !body.url) {
      toast.error(body.error || "Download failed.")
      return
    }
    window.open(body.url, "_blank", "noopener,noreferrer")
  }

  const archive = async () => {
    if (!link) return
    setArchiving(true)
    try {
      const res = await fetchWithSession(`/api/payment-links/${encodeURIComponent(link.id)}`, {
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
      onArchived()
      onOpenChange(false)
    } finally {
      setArchiving(false)
    }
  }

  return (
    <Dialog open={Boolean(link)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {link ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{link.label}</DialogTitle>
              <DialogDescription>
                {paymentLinkTypeLabel(link)} ·{" "}
                {formatCurrency(link.amountCents / 100, link.currency)}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-8 w-8 rounded object-cover" />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{name || "Your business"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(link.amountCents / 100, link.currency)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mx-auto rounded-xl border bg-card p-3">
              <QRCodeSVG value={link.url} size={180} includeMargin className="mx-auto h-auto" />
            </div>

            <p className="break-all rounded-lg bg-muted/50 p-3 text-center font-mono text-xs">
              {link.url}
            </p>

            {!easetag ? (
              <p className="text-center text-xs text-muted-foreground">
                Add an @easetag in Settings for shorter, friendlier links.
              </p>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" className="gap-2" onClick={() => void copy()}>
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button type="button" variant="outline" className="gap-2" asChild>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Preview
                </a>
              </Button>

              {link.rail === "stablecoin" && link.autopayoutConfigId ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => void downloadPlacard("png")}
                  >
                    <ImageIcon className="h-4 w-4" aria-hidden />
                    Placard PNG
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => void downloadPlacard("pdf")}
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    Placard PDF
                  </Button>
                </>
              ) : null}
            </div>

            {link.archivedAt ? null : (
              <Button
                type="button"
                variant="ghost"
                className="w-full gap-2 text-destructive"
                disabled={archiving}
                onClick={() => void archive()}
              >
                <Archive className="h-4 w-4" aria-hidden />
                {archiving ? "Closing…" : "Close this link"}
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
