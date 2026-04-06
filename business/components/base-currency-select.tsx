"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BaseCurrencyOptionLabel } from "@/components/base-currency-option-label"
import { useAllowedBaseCurrencies } from "@/hooks/use-allowed-base-currencies"
import { SETTINGS_CONTROL_SURFACE } from "@/lib/settings-control-surface"

type Props = {
  id?: string
  label: string
  value: string
  onValueChange: (code: string) => void
  disabled?: boolean
}

export function BaseCurrencySelect({ id, label, value, onValueChange, disabled }: Props) {
  const {
    currencies: baseCurrencies,
    loading: baseCurrenciesLoading,
    error: baseCurrenciesError,
  } = useAllowedBaseCurrencies()

  const selectDisabled =
    Boolean(disabled) ||
    baseCurrenciesLoading ||
    !baseCurrencies ||
    baseCurrencies.length === 0

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {baseCurrenciesError ? (
        <p className="text-sm text-destructive" role="status">
          {baseCurrenciesError}
        </p>
      ) : null}
      <Select value={value} onValueChange={onValueChange} disabled={selectDisabled}>
        <SelectTrigger
          id={id}
          className={`h-10 w-full data-[size=default]:h-10 ${SETTINGS_CONTROL_SURFACE}`}
        >
          <SelectValue
            placeholder={baseCurrenciesLoading ? "Loading currencies…" : "Select currency"}
          />
        </SelectTrigger>
        <SelectContent>
          {value &&
          baseCurrencies &&
          !baseCurrencies.some((c) => c.code === value) ? (
            <SelectItem value={value}>
              <BaseCurrencyOptionLabel
                code={value}
                suffix={
                  <span className="truncate text-xs text-muted-foreground">
                    (current — not in allowed list)
                  </span>
                }
              />
            </SelectItem>
          ) : null}
          {(baseCurrencies ?? []).map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <BaseCurrencyOptionLabel code={c.code} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
