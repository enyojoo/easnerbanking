"use client"

import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react"
import {
  GRID_KYB_COMPANY_DOCUMENT_CATEGORIES,
  GRID_KYB_DOCUMENT_CATEGORIES,
  type GridKybDocumentCategory,
  type GridKybErrorPointer,
} from "@easner/shared"
import { GRID_KYB_WIZARD_COPY } from "@/lib/copy/business-ui-copy"
import type { KybDocumentPacket } from "@/lib/grid/kyb-packet-types"
import { GridKybDocumentUpload } from "./grid-kyb-document-upload"
import { Button } from "@/components/ui/button"
import { useState } from "react"

type Props = {
  documents: KybDocumentPacket[]
  errors: GridKybErrorPointer[]
  disabled?: boolean
  onReload: () => Promise<void>
  onUploaded: (document: KybDocumentPacket) => void
  onRemove: (id: string) => Promise<void>
}

export function GridKybDocumentsStep({ documents, errors, disabled, onReload, onUploaded, onRemove }: Props) {
  const [openCategory, setOpenCategory] = useState<GridKybDocumentCategory | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{GRID_KYB_WIZARD_COPY.documentsTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{GRID_KYB_WIZARD_COPY.documentsSubtitle}</p>
      </div>
      <div className="space-y-2">
        {GRID_KYB_COMPANY_DOCUMENT_CATEGORIES.map((category) => {
          const meta = GRID_KYB_DOCUMENT_CATEGORIES[category]
          const uploaded = documents.filter((doc) => doc.category === category && !doc.personId)
          const error = errors.find((row) => row.documentCategory === category)
          return (
            <div key={category} className="rounded-2xl border bg-card">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => setOpenCategory(openCategory === category ? null : category)}
              >
                {error ? <AlertTriangle className="size-4 text-amber-600" /> : <span className="size-4" />}
                <span className="flex-1">
                  <span className="block text-sm font-medium">{meta.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {uploaded.length ? uploaded.map((doc) => doc.fileName).join(", ") : meta.caption}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
              {openCategory === category ? (
                <div className="space-y-3 border-t px-4 py-4">
                  {uploaded.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between text-sm">
                      <span>{doc.fileName}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled || removingId === doc.id}
                        onClick={() => {
                          setRemovingId(doc.id)
                          void onRemove(doc.id).finally(() => setRemovingId(null))
                        }}
                      >
                        {removingId === doc.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                        Remove
                      </Button>
                    </div>
                  ))}
                  <GridKybDocumentUpload
                    title={`Upload ${meta.label.toLowerCase()} document`}
                    category={category}
                    acceptedDocumentTypes={error?.acceptedDocumentTypes ?? meta.acceptedDocumentTypes}
                    disabled={disabled}
                    onUploaded={async (document) => {
                      if (document) onUploaded(document)
                      await onReload()
                    }}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
