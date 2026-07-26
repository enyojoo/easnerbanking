"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, MapPin } from "lucide-react"
import { CountryFlag } from "@/components/flags"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { countries } from "@/lib/countries"
import { cn } from "@/lib/utils"

export function PayrollCountrySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (countryCode: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => {
    const normalized = value.trim().toLowerCase()
    return countries.find(
      (country) =>
        country.code.toLowerCase() === normalized ||
        country.name.toLowerCase() === normalized,
    )
  }, [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between px-3 font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <CountryFlag code={selected.code} size={22} />
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              Select country of residence
            </span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Search countries…" className="h-9" />
          <CommandList className="max-h-64">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={`${country.name} ${country.code}`}
                  onSelect={() => {
                    onChange(country.code)
                    setOpen(false)
                  }}
                >
                  <CountryFlag code={country.code} size={22} />
                  <span className="flex-1">{country.name}</span>
                  <Check
                    className={cn(
                      "h-4 w-4",
                      selected?.code === country.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
