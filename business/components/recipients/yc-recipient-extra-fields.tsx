"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { RecipientYcMetadata, YcCorridorSchemaHint, YcRecipientFieldDef } from "@easner/shared"

type Props = {
  schema?: YcCorridorSchemaHint | null
  fields?: YcRecipientFieldDef[]
  values: RecipientYcMetadata
  onChange: (patch: Partial<RecipientYcMetadata>) => void
  errors?: Record<string, string>
  disabled?: boolean
}

/** Dynamic corridor extras (Grid IFSC/bank_code, YC Pix/CUIT, …). */
export function CorridorRecipientExtraFields({
  schema,
  fields,
  values,
  onChange,
  errors,
  disabled,
}: Props) {
  const list = fields ?? schema?.extra_fields ?? []
  if (!list.length) return null

  return (
    <div className="space-y-4">
      {list.map((field) => {
        const key = field.key
        if (key === "account_number") return null
        const value = String(values[key as keyof RecipientYcMetadata] ?? "")
        const err = errors?.[key]

        if (field.kind === "select" && field.options?.length) {
          return (
            <div key={key} className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              <Select
                value={value || undefined}
                onValueChange={(v) => onChange({ [key]: v } as Partial<RecipientYcMetadata>)}
                disabled={disabled}
              >
                <SelectTrigger className={`h-12 ${err ? "border-red-500" : ""}`}>
                  <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((opt) => (
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

        return (
          <div key={key} className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {field.label}
              {field.required ? " *" : ""}
            </Label>
            <Input
              value={value}
              onChange={(e) => onChange({ [key]: e.target.value } as Partial<RecipientYcMetadata>)}
              placeholder={field.placeholder || field.label}
              className={`h-12 ${err ? "border-red-500" : ""}`}
              disabled={disabled}
              inputMode={field.digits ? "numeric" : undefined}
            />
            {err ? <p className="text-xs text-red-500">{err}</p> : null}
          </div>
        )
      })}
    </div>
  )
}

/** @deprecated Use CorridorRecipientExtraFields */
export const YcRecipientExtraFields = CorridorRecipientExtraFields
