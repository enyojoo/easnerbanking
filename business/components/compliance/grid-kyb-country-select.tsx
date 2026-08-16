"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
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
  value: string
  onChange: (code: string) => void
  placeholder: string
  disabled?: boolean
  invalid?: boolean
}

function countryFromCode(code: string) {
  const normalized = code.trim().toUpperCase()
  return countries.find((row) => row.code === normalized)
}

export function GridKybCountrySelect({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
}: Props) {
  const [open, setOpen] = useState(false)
  const selected = countryFromCode(value)
  const options = useMemo(() => {
    const base = filterCountriesForProductPicker(countries, "business")
    if (selected && !base.some((row) => row.code === selected.code)) {
      return [selected, ...base]
    }
    return base
  }, [selected])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(SETTINGS_COMBOBOX_TRIGGER_CLASS, invalid && "border-destructive")}
        >
          <span className={cn("flex min-w-0 items-center gap-2", !selected && "text-muted-foreground")}>
            {selected ? (
              <>
                <CountryFlag code={selected.code} className="size-4" />
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {options.map((country) => (
                <CommandItem
                  key={country.code}
                  value={`${country.name} ${country.code}`}
                  onSelect={() => {
                    onChange(country.code)
                    setOpen(false)
                  }}
                >
                  <CountryFlag code={country.code} className="size-4" />
                  <span className="flex-1">{country.name}</span>
                  {selected?.code === country.code ? <Check className="size-4" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
