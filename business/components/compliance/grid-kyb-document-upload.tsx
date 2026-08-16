"use client"

import { forwardRef, useImperativeHandle, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { GRID_KYB_DOCUMENT_TYPE_LABELS } from "@easner/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SETTINGS_INPUT_CLASS } from "@/lib/settings-control-surface"
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
}

export type GridKybDocumentUploadHandle = {
  hasPendingFile: () => boolean
  submit: (personId?: string) => Promise<KybDocumentPacket | undefined>
}

export const GridKybDocumentUpload = forwardRef<GridKybDocumentUploadHandle, Props>(function GridKybDocumentUpload(
  {
  title,
  acceptedDocumentTypes,
  disabled,
  onUploaded,
  extraFields,
  category,
  hideSubmit,
}: Props,
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [documentType, setDocumentType] = useState(acceptedDocumentTypes[0] ?? "")
  const [issuingCountry, setIssuingCountry] = useState("")
  const [issuingAuthority, setIssuingAuthority] = useState("")
  const [documentNumber, setDocumentNumber] = useState("")
  const [fileName, setFileName] = useState("No file chosen")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const options = acceptedDocumentTypes.map((value) => ({
    value,
    label: GRID_KYB_DOCUMENT_TYPE_LABELS[value] ?? value,
  }))

  async function upload(personId = extraFields?.personId) {
    if (!file) {
      setError("Choose a file.")
      throw new Error("Choose a file.")
    }
    setSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.set("file", file)
      form.set("category", category)
      form.set("documentType", documentType)
      form.set("issuingCountry", issuingCountry)
      if (personId) form.set("personId", personId)
      if (issuingAuthority) form.set("issuingAuthority", issuingAuthority)
      if (documentNumber) form.set("documentNumber", documentNumber)
      const res = await fetch("/api/grid/kyb/documents", { method: "POST", body: form })
      const json = (await res.json().catch(() => ({}))) as { error?: string; document?: KybDocumentPacket }
      if (!res.ok) throw new Error(json.error || "Upload failed")
      setFile(null)
      setFileName("No file chosen")
      if (inputRef.current) inputRef.current.value = ""
      if (!hideSubmit) await onUploaded(json.document)
      return json.document
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed"
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
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <div>
        <p className="text-xs text-muted-foreground">Upload document</p>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
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
          <p className="text-xs text-muted-foreground">Enter the number shown on the ID.</p>
          <Input
            className={SETTINGS_INPUT_CLASS}
            value={documentNumber}
            onChange={(event) => setDocumentNumber(event.target.value)}
            placeholder="Passport number, license number, or similar ID"
            disabled={disabled}
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>File</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Choose file
          </Button>
          <span className="text-sm text-muted-foreground">{fileName}</span>
        </div>
        <p className="text-xs text-muted-foreground">PDF, JPEG, or PNG. Maximum file size is 10 MB.</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null
            setFile(next)
            setFileName(next?.name ?? "No file chosen")
          }}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {hideSubmit ? null : (
        <Button type="button" size="sm" disabled={disabled || saving} onClick={() => void upload()}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Upload
        </Button>
      )}
    </div>
  )
})
