"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"
import { GRID_KYB_DOCUMENT_TYPE_LABELS } from "@easner/shared"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SETTINGS_INPUT_CLASS } from "@/lib/settings-control-surface"
import { uploadKybDocument } from "@/lib/grid/upload-kyb-document"
import type { KybDocumentPacket } from "@/lib/grid/kyb-packet-types"
import { GridKybEnumSelect } from "./grid-kyb-enum-select"
import { GridKybCountrySelect } from "./grid-kyb-country-select"

type Props = {
  title: string
  acceptedDocumentTypes: string[]
  disabled?: boolean
  onUploaded: (document?: KybDocumentPacket) => Promise<void> | void
  extraFields?: {
    personId?: string
    issuingAuthority?: boolean
    documentNumber?: boolean
  }
  category: string
  hideSubmit?: boolean
  existingDocuments?: KybDocumentPacket[]
  onRemoveExisting?: (id: string) => Promise<void>
  fileHint?: string
  rejected?: boolean
  rejectionReason?: string
}

export type GridKybDocumentUploadHandle = {
  hasPendingFile: () => boolean
  submit: (personId?: string) => Promise<KybDocumentPacket | undefined>
}

const FILE_ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.pdf"

export const GridKybDocumentUpload = forwardRef<GridKybDocumentUploadHandle, Props>(function GridKybDocumentUpload(
  {
    title,
    acceptedDocumentTypes,
    disabled,
    onUploaded,
    extraFields,
    category,
    hideSubmit,
    existingDocuments = [],
    onRemoveExisting,
    fileHint,
    rejected,
    rejectionReason,
  }: Props,
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const latestExisting = existingDocuments[existingDocuments.length - 1]
  const [documentType, setDocumentType] = useState(
    latestExisting?.documentType || acceptedDocumentTypes[0] || "",
  )
  const [issuingCountry, setIssuingCountry] = useState(latestExisting?.issuingCountry ?? "")
  const [issuingAuthority, setIssuingAuthority] = useState(latestExisting?.issuingAuthority ?? "")
  const [documentNumber, setDocumentNumber] = useState(latestExisting?.documentNumber ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    const latest = existingDocuments[existingDocuments.length - 1]
    if (!latest || file) return
    if (latest.documentType) setDocumentType(latest.documentType)
    if (latest.issuingCountry) setIssuingCountry(latest.issuingCountry)
    if (latest.issuingAuthority) setIssuingAuthority(latest.issuingAuthority)
    if (latest.documentNumber) setDocumentNumber(latest.documentNumber)
  }, [existingDocuments, file])

  const options = acceptedDocumentTypes.map((value) => ({
    value,
    label: GRID_KYB_DOCUMENT_TYPE_LABELS[value] ?? value,
  }))
  const hasStoredFile = existingDocuments.length > 0
  const showUpload = Boolean(file) && !hideSubmit && !saving
  const needsReplacement = Boolean(rejected || rejectionReason)

  async function removeExistingRows() {
    if (!onRemoveExisting) return
    for (const doc of existingDocuments) {
      setRemovingId(doc.id)
      try {
        await onRemoveExisting(doc.id)
      } finally {
        setRemovingId(null)
      }
    }
  }

  async function upload(personId = extraFields?.personId, nextFile = file) {
    if (!nextFile) {
      setError("Choose a file.")
      throw new Error("Choose a file.")
    }
    setSaving(true)
    setError(null)
    try {
      const document = await uploadKybDocument(nextFile, {
        category,
        personId,
        documentType,
        issuingCountry,
        issuingAuthority,
        documentNumber,
      })
      if (existingDocuments.length) await removeExistingRows()
      setFile(null)
      if (inputRef.current) inputRef.current.value = ""
      await onUploaded(document)
      return document
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not store the file."
      setError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({
    hasPendingFile: () => Boolean(file),
    submit: (personId) => upload(personId ?? extraFields?.personId),
  }))

  return (
    <div
      className={cn(
        "space-y-4 rounded-lg border bg-card p-4",
        needsReplacement && "border-destructive",
      )}
    >
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Document type</Label>
          <GridKybEnumSelect
            value={documentType}
            onChange={setDocumentType}
            options={options}
            placeholder="Select document type"
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`issuing-country-${category}`}>Issuing country</Label>
          <GridKybCountrySelect
            id={`issuing-country-${category}`}
            value={issuingCountry}
            onChange={setIssuingCountry}
            placeholder="Select issuing country"
            catalog="all"
            disabled={disabled}
          />
        </div>
        {extraFields?.issuingAuthority ? (
          <div className="space-y-2">
            <Label>Issuing authority</Label>
            <Input
              className={SETTINGS_INPUT_CLASS}
              value={issuingAuthority}
              onChange={(event) => setIssuingAuthority(event.target.value)}
              placeholder="e.g. California DMV, U.S. Department of State"
              disabled={disabled}
            />
          </div>
        ) : null}
        {extraFields?.documentNumber ? (
          <div className="space-y-2">
            <Label>Document number</Label>
            <Input
              className={SETTINGS_INPUT_CLASS}
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              placeholder="Passport number, license number, or similar ID"
              disabled={disabled}
            />
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          "space-y-3 rounded-md border p-3",
          needsReplacement
            ? "border-destructive bg-destructive/5"
            : "border-border bg-muted/30",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label>Upload file</Label>
            {needsReplacement ? (
              <p className="mt-1 text-sm text-destructive">
                {rejectionReason || "This file was rejected. Replace it with a clearer PDF or image of the ID."}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant={needsReplacement ? "primary" : "outline"}
            size="sm"
            className="shrink-0"
            disabled={disabled || saving}
            onClick={() => inputRef.current?.click()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {saving ? "Uploading…" : hasStoredFile || file ? "Replace file" : "Choose file"}
          </Button>
        </div>
        {existingDocuments.length || file ? (
          <ul className="space-y-1.5">
            {existingDocuments.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{doc.fileName}</span>
                {needsReplacement ? (
                  <span className="shrink-0 text-xs font-medium text-destructive">
                    Needs a new file
                  </span>
                ) : null}
                {onRemoveExisting ? (
                  <button
                    type="button"
                    aria-label={`Remove ${doc.fileName}`}
                    disabled={disabled || removingId === doc.id || saving}
                    onClick={() => {
                      setRemovingId(doc.id)
                      void onRemoveExisting(doc.id)
                        .catch((err) => setError(err instanceof Error ? err.message : "Could not remove document"))
                        .finally(() => setRemovingId(null))
                    }}
                    className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {removingId === doc.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <X className="size-3.5" />
                    )}
                  </button>
                ) : null}
              </li>
            ))}
            {file ? (
              <li className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                {saving ? <span className="text-xs text-muted-foreground">Uploading…</span> : null}
                <button
                  type="button"
                  aria-label="Clear selected file"
                  disabled={disabled || saving}
                  onClick={() => {
                    setFile(null)
                    if (inputRef.current) inputRef.current.value = ""
                  }}
                  className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No file chosen yet.</p>
        )}
        <p className="text-xs text-muted-foreground">
          {fileHint || "PDF, JPEG, PNG, or HEIC. Maximum 10 MB – photograph the ID if the PDF is large."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null
            setFile(next)
            setError(null)
            if (!next) return
            if (extraFields?.personId) {
              void upload(extraFields.personId, next)
              return
            }
            if (!hideSubmit) void upload(undefined, next)
          }}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {showUpload ? (
        <Button type="button" size="sm" disabled={disabled || saving} onClick={() => void upload()}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Upload
        </Button>
      ) : null}
    </div>
  )
})
