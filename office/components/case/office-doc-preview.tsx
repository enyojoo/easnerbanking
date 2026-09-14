"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { officeFetch } from "@/lib/api-client"
import { displayText } from "@/lib/case/status"
import type { OfficeKybDocument } from "@/lib/case/types"
import { GRID_KYB_DOCUMENT_TYPE_LABELS } from "@easner/shared"
import { OfficeDetailRow } from "./office-detail-grid"

export function OfficeDocPreview({
  businessId,
  document,
  onClose,
}: {
  businessId: string
  document: OfficeKybDocument | null
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!document) {
      setUrl(null)
      setError(null)
      return
    }
    let cancelled = false
    setUrl(null)
    setError(null)
    void officeFetch(
      `/api/admin/office/businesses/${encodeURIComponent(businessId)}/kyb-documents/${encodeURIComponent(document.id)}`,
    )
      .then(async (r) => {
        const d = (await r.json()) as { url?: string; error?: string }
        if (cancelled) return
        if (!r.ok || !d.url) throw new Error(d.error || "Could not preview")
        setUrl(d.url)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not preview")
      })
    return () => {
      cancelled = true
    }
  }, [businessId, document])

  const type = document
    ? GRID_KYB_DOCUMENT_TYPE_LABELS[document.documentType] || document.documentType
    : ""
  const isPdf = (document?.contentType || "").includes("pdf") || document?.fileName.toLowerCase().endsWith(".pdf")
  const isImage = (document?.contentType || "").startsWith("image/")

  return (
    <Dialog open={Boolean(document)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{document?.fileName || "Document"}</DialogTitle>
        </DialogHeader>
        {document ? (
          <div className="space-y-3">
            <OfficeDetailRow label="Type">{displayText(type)}</OfficeDetailRow>
            <OfficeDetailRow label="Category">{displayText(document.category)}</OfficeDetailRow>
            <OfficeDetailRow label="Number" mono>
              {displayText(document.documentNumber)}
            </OfficeDetailRow>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {url && isImage ? (
              <img src={url} alt="" className="max-h-[70vh] w-full rounded border object-contain" />
            ) : null}
            {url && isPdf ? <iframe title="Document" src={url} className="h-[70vh] w-full rounded border" /> : null}
            {url && !isImage && !isPdf ? (
              <Button asChild variant="outline" size="sm">
                <a href={url} target="_blank" rel="noreferrer">
                  Download
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
