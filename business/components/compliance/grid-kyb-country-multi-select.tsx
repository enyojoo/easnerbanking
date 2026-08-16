"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { CountryFlag } from "@/components/flags"
import { countries } from "@/lib/countries"
import { filterCountriesForProductPicker } from "@easner/shared"
import { SETTINGS_COMBOBOX_TRIGGER_CLASS } from "@/lib/settings-control-surface"
import { cn } from "@/lib/utils"

type Props = {
  id?: string
  value: string[]
  onChange: (codes: string[]) => void
  placeholder: string
  disabled?: boolean
  invalid?: boolean
}

export function GridKybCountryMultiSelect({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
}: Props) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(
    () => value.map((code) => countries.find((row) => row.code === code)).filter(Boolean),
    [value],
  )
  const options = useMemo(() => filterCountriesForProductPicker(countries, "business"), [])

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className={cn(SETTINGS_COMBOBOX_TRIGGER_CLASS, invalid && "border-destructive")}
          >
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
              {placeholder}
            </span>
            <ChevronDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country" />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {options.map((country) => {
                  const active = value.includes(country.code)
                  return (
                    <CommandItem
                      key={country.code}
                      value={`${country.name} ${country.code}`}
                      onSelect={() => {
                        onChange(
                          active ? value.filter((code) => code !== country.code) : [...value, country.code],
                        )
                      }}
                    >
                      <CountryFlag code={country.code} className="size-4" />
                      <span className="flex-1">{country.name}</span>
                      {active ? <Check className="size-4" /> : null}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((country) =>
            country ? (
              <button
                key={country.code}
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((code) => code !== country.code))}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
              >
                <CountryFlag code={country.code} className="size-3" />
                {country.name}
                <X className="size-3 text-muted-foreground" />
              </button>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  )
}
