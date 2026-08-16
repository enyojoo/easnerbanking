"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SETTINGS_SELECT_TRIGGER_CLASS } from "@/lib/settings-control-surface"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string }

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: readonly Option[]
  placeholder: string
  disabled?: boolean
  invalid?: boolean
}

export function GridKybEnumSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  invalid,
}: Props) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(SETTINGS_SELECT_TRIGGER_CLASS, invalid && "border-destructive")}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
