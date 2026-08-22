"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"
import { GRID_KYB_DOCUMENT_TYPE_LABELS } from "@easner/shared"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SETTINGS_INPUT_CLASS } from "@/lib/settings-control-surface"
import { patchKybDocumentMetadata, uploadKybDocument } from "@/lib/grid/upload-kyb-document"
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
    documentNumber?: boolean
  }
  category: string
  hideSubmit?: boolean
  existingDocuments?: KybDocumentPacket[]
  onRemoveExisting?: (id: string) => Promise<void>
  fileHint?: string
  rejected?: boolean
  rejectionReason?: string
  resolvePersonId?: () => Promise<string | undefined>
  onBusyChange?: (busy: boolean) => void
}

export type GridKybDocumentUploadHandle = {
  hasPendingFile: () => boolean
  showingError: () => boolean
  submit: (personId?: string) => Promise<KybDocumentPacket | undefined>
  persistMetadata: () => Promise<void>
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
    existingDocuments = [],
    onRemoveExisting,
    fileHint,
    rejected,
    rejectionReason,
    resolvePersonId,
    onBusyChange,
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
  const [errorKind, setErrorKind] = useState<"meta" | "file">("file")

  function showMetaError(message: string) {
    setErrorKind("meta")
    setError(message)
  }

  function showFileError(message: string) {
    setErrorKind("file")
    setError(message)
  }
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const uploadPromiseRef = useRef<Promise<KybDocumentPacket | undefined> | null>(null)

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
  const needsReplacement = Boolean(rejected || rejectionReason)
  const requiresIdentityMeta = category === "identity" && Boolean(extraFields?.documentNumber)

  function identityMetaError() {
    if (!requiresIdentityMeta) return null
    if (!documentType.trim()) return "Select a document type before uploading."
    if (!issuingCountry.trim()) return "Select the issuing country before uploading."
    if (!issuingAuthority.trim()) return "Enter the issuing authority before uploading."
    if (!documentNumber.trim()) return "Enter the document number before uploading."
    return null
  }

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
    if (uploadPromiseRef.current) return uploadPromiseRef.current
    if (!nextFile) {
      showFileError("Choose a file.")
      throw new Error("Choose a file.")
    }
    const missing = identityMetaError()
    if (missing) {
      showMetaError(missing)
      throw new Error(missing)
    }
    const run = (async () => {
      setSaving(true)
      onBusyChange?.(true)
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
        showFileError(message)
        throw err instanceof Error ? err : new Error(message)
      } finally {
        setSaving(false)
        onBusyChange?.(false)
      }
    })()
    uploadPromiseRef.current = run
    try {
      return await run
    } finally {
      if (uploadPromiseRef.current === run) uploadPromiseRef.current = null
    }
  }

  async function persistMetadata(overrides?: {
    documentType?: string
    issuingCountry?: string
    issuingAuthority?: string
    documentNumber?: string
  }) {
    const latest = existingDocuments[existingDocuments.length - 1]
    if (!latest) return
    const nextType = overrides?.documentType ?? documentType
    const nextCountry = overrides?.issuingCountry ?? issuingCountry
    const nextAuthority = overrides?.issuingAuthority ?? issuingAuthority
    const nextNumber = overrides?.documentNumber ?? documentNumber
    if (requiresIdentityMeta && (!nextType.trim() || !nextCountry.trim() || !nextAuthority.trim() || !nextNumber.trim())) {
      const message = !nextCountry.trim()
        ? "Select the issuing country before uploading."
        : !nextAuthority.trim()
          ? "Enter the issuing authority before uploading."
          : !nextNumber.trim()
            ? "Enter the document number before uploading."
            : "Select a document type before uploading."
      showMetaError(message)
      throw new Error(message)
    }
    setSaving(true)
    onBusyChange?.(true)
    setError(null)
    try {
      const document = await patchKybDocumentMetadata(latest.id, {
        documentType: nextType,
        issuingCountry: nextCountry,
        issuingAuthority: nextAuthority,
        documentNumber: nextNumber,
      })
      await onUploaded(document)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update document details."
      showFileError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setSaving(false)
      onBusyChange?.(false)
    }
  }

  useImperativeHandle(ref, () => ({
    hasPendingFile: () => Boolean(file) || Boolean(uploadPromiseRef.current),
    showingError: () => Boolean(error),
    submit: (personId) => {
      if (uploadPromiseRef.current) return uploadPromiseRef.current
      return upload(personId ?? extraFields?.personId)
    },
    persistMetadata,
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
      <div
        className={cn(
          "grid gap-4",
          extraFields?.documentNumber ? "sm:grid-cols-2" : "md:grid-cols-2",
        )}
      >
        <div className="space-y-2">
          <Label>Document type{requiresIdentityMeta ? " *" : ""}</Label>
          <GridKybEnumSelect
            value={documentType}
            onChange={(next) => {
              setDocumentType(next)
              if (
                hasStoredFile &&
                next.trim() &&
                issuingCountry.trim() &&
                issuingAuthority.trim() &&
                documentNumber.trim()
              ) {
                void persistMetadata({ documentType: next }).catch(() => undefined)
              }
            }}
            options={options}
            placeholder="Select document type"
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`issuing-country-${category}`}>
            Issuing country{requiresIdentityMeta ? " *" : ""}
          </Label>
          <GridKybCountrySelect
            id={`issuing-country-${category}`}
            value={issuingCountry}
            onChange={(next) => {
              setIssuingCountry(next)
              if (hasStoredFile && next.trim() && issuingAuthority.trim() && documentNumber.trim()) {
                void persistMetadata({ issuingCountry: next }).catch(() => undefined)
              }
            }}
            placeholder="Select issuing country"
            catalog="all"
            disabled={disabled}
          />
        </div>
        {extraFields?.documentNumber ? (
          <>
            <div className="space-y-2">
              <Label>Issuing authority{requiresIdentityMeta ? " *" : ""}</Label>
              <Input
                className={SETTINGS_INPUT_CLASS}
                value={issuingAuthority}
                onChange={(event) => setIssuingAuthority(event.target.value)}
                onBlur={() => {
                  if (
                    !hasStoredFile ||
                    !issuingAuthority.trim() ||
                    !issuingCountry.trim() ||
                    !documentNumber.trim()
                  ) {
                    return
                  }
                  void persistMetadata().catch(() => undefined)
                }}
                placeholder="e.g. Immigration Service, passport office"
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Document number{requiresIdentityMeta ? " *" : ""}</Label>
              <Input
                className={SETTINGS_INPUT_CLASS}
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                onBlur={() => {
                  if (
                    !hasStoredFile ||
                    !documentNumber.trim() ||
                    !issuingCountry.trim() ||
                    !issuingAuthority.trim()
                  ) {
                    return
                  }
                  void persistMetadata().catch(() => undefined)
                }}
                placeholder="Passport number, license number, or similar ID"
                disabled={disabled}
              />
            </div>
          </>
        ) : null}
      </div>
      {error && errorKind === "meta" ? <p className="text-sm text-destructive">{error}</p> : null}
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
            onClick={() => {
              const missing = identityMetaError()
              if (missing) {
                showMetaError(missing)
                return
              }
              inputRef.current?.click()
            }}
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
                        .catch((err) => showFileError(err instanceof Error ? err.message : "Could not remove document"))
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
        {error && errorKind === "file" ? <p className="text-sm text-destructive">{error}</p> : null}
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
            void (async () => {
              try {
                const personId = extraFields?.personId ?? (await resolvePersonId?.())
                await upload(personId, next)
              } catch (err) {
                showFileError(err instanceof Error ? err.message : "Could not store the file.")
              }
            })()
          }}
        />
      </div>
    </div>
  )
})
