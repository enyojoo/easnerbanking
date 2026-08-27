"use client"

import type { ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  brazilPixKeyIsTaxId,
  type RecipientYcMetadata,
  type YcCorridorSchemaHint,
  type YcRecipientFieldDef,
} from "@easner/shared"

type Props = {
  schema?: YcCorridorSchemaHint | null
  fields?: YcRecipientFieldDef[]
  values: RecipientYcMetadata
  onChange: (patch: Partial<RecipientYcMetadata>) => void
  errors?: Record<string, string>
  disabled?: boolean
  /** When Pix type is present, rendered in the same row (larger column). */
  accountNumber?: ReactNode
}

function isPixKeyTypeField(field: YcRecipientFieldDef): boolean {
  return field.key === "pix_key_type"
}

/** Dynamic corridor extras (Grid IFSC/bank_code, YC Pix/CUIT, …). */
export function CorridorRecipientExtraFields({
  schema,
  fields,
  values,
  onChange,
  errors,
  disabled,
  accountNumber,
}: Props) {
  const list = fields ?? schema?.extra_fields ?? []
  const pixTypeField = list.find(isPixKeyTypeField)
  const pixType = String(values.pix_key_type ?? "")
  const hideTaxId = brazilPixKeyIsTaxId(pixType)
  const otherFields = list.filter((field) => {
    if (field.key === "account_number" || isPixKeyTypeField(field)) return false
    if (field.key === "tax_id" && hideTaxId) return false
    return true
  })
  if (!list.length && !accountNumber) return null

  const renderSelect = (field: YcRecipientFieldDef) => {
    const key = field.key
    const value = String(values[key as keyof RecipientYcMetadata] ?? "")
    const err = errors?.[key]
    return (
      <div key={key} className="space-y-2 min-w-0">
        <Label className="text-xs text-muted-foreground">
          {field.label}
          {field.required ? " *" : ""}
        </Label>
        <Select
          value={value || undefined}
          onValueChange={(v) => onChange({ [key]: v } as Partial<RecipientYcMetadata>)}
          disabled={disabled}
        >
          <SelectTrigger className={`h-12 w-full ${err ? "border-red-500" : ""}`}>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {err ? <p className="text-xs text-red-500">{err}</p> : null}
      </div>
    )
  }

  const renderText = (field: YcRecipientFieldDef) => {
    const key = field.key
    const value = String(values[key as keyof RecipientYcMetadata] ?? "")
    const err = errors?.[key]
    const required = field.required || field.key === "tax_id"
    return (
      <div key={key} className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          {field.label}
          {required ? " *" : ""}
        </Label>
        <Input
          value={value}
          onChange={(e) => onChange({ [key]: e.target.value } as Partial<RecipientYcMetadata>)}
          placeholder={field.placeholder || field.label}
          className={`h-12 ${err ? "border-red-500" : ""}`}
          disabled={disabled}
          inputMode={field.digits || field.key === "tax_id" ? "numeric" : undefined}
        />
        {err ? <p className="text-xs text-red-500">{err}</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {pixTypeField && accountNumber ? (
        <div className="grid grid-cols-[minmax(8rem,10.5rem)_minmax(0,1fr)] gap-4 items-start">
          {pixTypeField.kind === "select" ? renderSelect(pixTypeField) : renderText(pixTypeField)}
          <div className="min-w-0">{accountNumber}</div>
        </div>
      ) : (
        <>
          {accountNumber}
          {pixTypeField
            ? pixTypeField.kind === "select"
              ? renderSelect(pixTypeField)
              : renderText(pixTypeField)
            : null}
        </>
      )}
      {otherFields.map((field) =>
        field.kind === "select" && field.options?.length ? renderSelect(field) : renderText(field),
      )}
    </div>
  )
}

/** @deprecated Use CorridorRecipientExtraFields */
export const YcRecipientExtraFields = CorridorRecipientExtraFields
