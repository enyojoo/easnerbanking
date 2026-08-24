"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"
import {
  GRID_KYB_DOCUMENT_TYPE_LABELS,
  gridKybIdentityDocumentRequiresSides,
  type GridKybDocumentSide,
} from "@easner/shared"
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

type UploadSlotKey = GridKybDocumentSide | "single"

const FILE_ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.pdf"

const SIDE_LABELS: Record<GridKybDocumentSide, string> = {
  FRONT: "Front of license",
  BACK: "Back of license",
}

function normalizeSide(value: string | null | undefined): GridKybDocumentSide | null {
  const side = String(value ?? "").trim().toUpperCase()
  return side === "FRONT" || side === "BACK" ? side : null
}

function slotKeyForSide(side: GridKybDocumentSide | null): UploadSlotKey {
  return side ?? "single"
}

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
  const sideInputRefs = useRef<Partial<Record<GridKybDocumentSide, HTMLInputElement | null>>>({})
  const latestExisting = existingDocuments[existingDocuments.length - 1]
  const [documentType, setDocumentType] = useState(
    latestExisting?.documentType || acceptedDocumentTypes[0] || "",
  )
  const [issuingCountry, setIssuingCountry] = useState(latestExisting?.issuingCountry ?? "")
  const [issuingAuthority, setIssuingAuthority] = useState(latestExisting?.issuingAuthority ?? "")
  const [documentNumber, setDocumentNumber] = useState(latestExisting?.documentNumber ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [filesBySide, setFilesBySide] = useState<Partial<Record<GridKybDocumentSide, File>>>({})
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<"meta" | "file">("file")
  const [uploadingSlots, setUploadingSlots] = useState<Set<UploadSlotKey>>(() => new Set())
  const [metaBusy, setMetaBusy] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const uploadPromisesRef = useRef<Partial<Record<UploadSlotKey, Promise<KybDocumentPacket | undefined>>>>({})
  const busyCountRef = useRef(0)

  function showMetaError(message: string) {
    setErrorKind("meta")
    setError(message)
  }

  function showFileError(message: string) {
    setErrorKind("file")
    setError(message)
  }

  function beginBusy() {
    busyCountRef.current += 1
    onBusyChange?.(true)
  }

  function endBusy() {
    busyCountRef.current = Math.max(0, busyCountRef.current - 1)
    if (busyCountRef.current === 0) onBusyChange?.(false)
  }

  const requiredSides = gridKybIdentityDocumentRequiresSides({ documentType, issuingCountry })
  const anyFileUploading = uploadingSlots.size > 0
  const fieldsDisabled = Boolean(disabled || anyFileUploading || metaBusy)

  function markSlotUploading(slot: UploadSlotKey, active: boolean) {
    setUploadingSlots((current) => {
      const next = new Set(current)
      if (active) next.add(slot)
      else next.delete(slot)
      return next
    })
  }

  useEffect(() => {
    const latest = existingDocuments[existingDocuments.length - 1]
    if (!latest || file || Object.keys(filesBySide).length > 0) return
    if (latest.documentType) setDocumentType(latest.documentType)
    if (latest.issuingCountry) setIssuingCountry(latest.issuingCountry)
    if (latest.issuingAuthority) setIssuingAuthority(latest.issuingAuthority)
    if (latest.documentNumber) setDocumentNumber(latest.documentNumber)
  }, [existingDocuments, file, filesBySide])

  const options = acceptedDocumentTypes.map((value) => ({
    value,
    label: GRID_KYB_DOCUMENT_TYPE_LABELS[value] ?? value,
  }))
  const hasStoredFile = existingDocuments.length > 0
  const needsReplacement = Boolean(rejected || rejectionReason)
  const requiresIdentityMeta = category === "identity" && Boolean(extraFields?.documentNumber)

  function existingForSide(side: GridKybDocumentSide | null) {
    if (side) {
      return existingDocuments.filter((doc) => normalizeSide(doc.side) === side)
    }
    return existingDocuments.filter((doc) => !normalizeSide(doc.side))
  }

  function identityMetaError() {
    if (!requiresIdentityMeta) return null
    if (!documentType.trim()) return "Select a document type before uploading."
    if (!issuingCountry.trim()) return "Select the issuing country before uploading."
    if (!issuingAuthority.trim()) return "Enter the issuing authority before uploading."
    if (!documentNumber.trim()) return "Enter the document number before uploading."
    return null
  }

  async function removeExistingRows(side: GridKybDocumentSide | null) {
    if (!onRemoveExisting) return
    for (const doc of existingForSide(side)) {
      setRemovingId(doc.id)
      try {
        await onRemoveExisting(doc.id)
      } finally {
        setRemovingId(null)
      }
    }
  }

  async function upload(
    personId = extraFields?.personId,
    nextFile = file,
    side: GridKybDocumentSide | null = null,
  ) {
    const slot = slotKeyForSide(side)
    const inFlight = uploadPromisesRef.current[slot]
    if (inFlight) return inFlight
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
      markSlotUploading(slot, true)
      beginBusy()
      setError(null)
      try {
        if (side && onRemoveExisting) {
          for (const doc of existingDocuments.filter((row) => !normalizeSide(row.side))) {
            setRemovingId(doc.id)
            try {
              await onRemoveExisting(doc.id)
            } finally {
              setRemovingId(null)
            }
          }
        }
        const document = await uploadKybDocument(nextFile, {
          category,
          personId,
          documentType,
          issuingCountry,
          issuingAuthority,
          documentNumber,
          side: side ?? undefined,
        })
        if (existingForSide(side).length) await removeExistingRows(side)
        if (side) {
          setFilesBySide((current) => {
            const next = { ...current }
            delete next[side]
            return next
          })
          const sideInput = sideInputRefs.current[side]
          if (sideInput) sideInput.value = ""
        } else {
          setFile(null)
          if (inputRef.current) inputRef.current.value = ""
        }
        await onUploaded(document)
        return document
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not store the file."
        showFileError(message)
        throw err instanceof Error ? err : new Error(message)
      } finally {
        markSlotUploading(slot, false)
        endBusy()
      }
    })()
    uploadPromisesRef.current[slot] = run
    try {
      return await run
    } finally {
      if (uploadPromisesRef.current[slot] === run) delete uploadPromisesRef.current[slot]
    }
  }

  async function persistMetadata(overrides?: {
    documentType?: string
    issuingCountry?: string
    issuingAuthority?: string
    documentNumber?: string
  }) {
    const targets = requiredSides?.length
      ? existingDocuments.filter((doc) => requiredSides.includes(normalizeSide(doc.side) as GridKybDocumentSide))
      : latestExisting
        ? [latestExisting]
        : []
    if (!targets.length) return
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
    setMetaBusy(true)
    beginBusy()
    setError(null)
    try {
      let latest: KybDocumentPacket | undefined
      for (const doc of targets) {
        latest = await patchKybDocumentMetadata(doc.id, {
          documentType: nextType,
          issuingCountry: nextCountry,
          issuingAuthority: nextAuthority,
          documentNumber: nextNumber,
          side: doc.side ?? undefined,
        })
      }
      await onUploaded(latest)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update document details."
      showFileError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setMetaBusy(false)
      endBusy()
    }
  }

  useImperativeHandle(ref, () => ({
    hasPendingFile: () => {
      if (Object.keys(uploadPromisesRef.current).length > 0) return true
      if (requiredSides?.length) {
        return requiredSides.some((side) => Boolean(filesBySide[side]))
      }
      return Boolean(file)
    },
    showingError: () => Boolean(error),
    submit: async (personId) => {
      if (requiredSides?.length) {
        let latest: KybDocumentPacket | undefined
        for (const side of requiredSides) {
          const pending = filesBySide[side]
          if (pending) {
            latest = await upload(personId ?? extraFields?.personId, pending, side)
          }
        }
        return latest
      }
      const inFlight = uploadPromisesRef.current.single
      if (inFlight) return inFlight
      return upload(personId ?? extraFields?.personId)
    },
    persistMetadata,
  }))

  function renderFilePanel(input: {
    side: GridKybDocumentSide | null
    label: string
    storedDocuments: KybDocumentPacket[]
    pendingFile: File | null
    setInputNode: (node: HTMLInputElement | null) => void
    onChooseFile: () => void
    onClearPending: () => void
    onFileSelected: (next: File | null) => void
  }) {
    const slot = slotKeyForSide(input.side)
    const isUploadingThis = uploadingSlots.has(slot)
    const hasSideStoredFile = input.storedDocuments.length > 0
    const ctaLabel = isUploadingThis
      ? "Uploading…"
      : hasSideStoredFile || input.pendingFile
        ? "Replace file"
        : "Choose file"

    return (
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
            <Label>{input.label}</Label>
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
            disabled={fieldsDisabled}
            onClick={input.onChooseFile}
          >
            {isUploadingThis ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ctaLabel}
          </Button>
        </div>
        {hasSideStoredFile || input.pendingFile ? (
          <ul className="space-y-1.5">
            {input.storedDocuments.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{doc.fileName}</span>
                {needsReplacement ? (
                  <span className="shrink-0 text-xs font-medium text-destructive">Needs a new file</span>
                ) : null}
                {onRemoveExisting ? (
                  <button
                    type="button"
                    aria-label={`Remove ${doc.fileName}`}
                    disabled={fieldsDisabled || removingId === doc.id}
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
            {input.pendingFile && !hasSideStoredFile ? (
              <li className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{input.pendingFile.name}</span>
                {isUploadingThis ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    Uploading…
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label="Clear selected file"
                    disabled={fieldsDisabled}
                    onClick={input.onClearPending}
                    className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No file chosen yet.</p>
        )}
        <input
          ref={input.setInputNode}
          type="file"
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null
            input.onFileSelected(next)
            setError(null)
            if (!next) return
            void (async () => {
              try {
                const personId = extraFields?.personId ?? (await resolvePersonId?.())
                await upload(personId, next, input.side)
              } catch (err) {
                showFileError(err instanceof Error ? err.message : "Could not store the file.")
              }
            })()
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-lg border bg-card p-4",
        needsReplacement && "border-destructive",
      )}
    >
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {requiredSides?.length ? (
          <p className="mt-1 text-sm text-muted-foreground">
            US driver&apos;s licenses require separate front and back photos.
          </p>
        ) : null}
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
            disabled={fieldsDisabled}
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
            disabled={fieldsDisabled}
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
                placeholder="e.g. DMV, state motor vehicle department"
                disabled={fieldsDisabled}
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
                disabled={fieldsDisabled}
              />
            </div>
          </>
        ) : null}
      </div>
      {error && errorKind === "meta" ? <p className="text-sm text-destructive">{error}</p> : null}
      {requiredSides?.length ? (
        <div className="space-y-3">
          {requiredSides.map((side) =>
            renderFilePanel({
              side,
              label: SIDE_LABELS[side],
              storedDocuments: existingForSide(side),
              pendingFile: filesBySide[side] ?? null,
              setInputNode: (node) => {
                sideInputRefs.current[side] = node
              },
              onChooseFile: () => {
                const missing = identityMetaError()
                if (missing) {
                  showMetaError(missing)
                  return
                }
                sideInputRefs.current[side]?.click()
              },
              onClearPending: () => {
                setFilesBySide((current) => {
                  const next = { ...current }
                  delete next[side]
                  return next
                })
                const sideInput = sideInputRefs.current[side]
                if (sideInput) sideInput.value = ""
              },
              onFileSelected: (next) => {
                setFilesBySide((current) => {
                  const updated = { ...current }
                  if (next) updated[side] = next
                  else delete updated[side]
                  return updated
                })
              },
            }),
          )}
        </div>
      ) : (
        renderFilePanel({
          side: null,
          label: "Upload file",
          storedDocuments: existingForSide(null),
          pendingFile: file,
          setInputNode: (node) => {
            inputRef.current = node
          },
          onChooseFile: () => {
            const missing = identityMetaError()
            if (missing) {
              showMetaError(missing)
              return
            }
            inputRef.current?.click()
          },
          onClearPending: () => {
            setFile(null)
            if (inputRef.current) inputRef.current.value = ""
          },
          onFileSelected: (next) => setFile(next),
        })
      )}
      <p className="text-xs text-muted-foreground">
        {fileHint || "PDF, JPEG, PNG, or HEIC. Maximum 10 MB – photograph the ID if the PDF is large."}
      </p>
      {error && errorKind === "file" ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
})
