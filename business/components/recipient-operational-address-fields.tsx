"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { DYNAMIC_COMBOBOX_LIST_CLASS } from "@/lib/combobox-list-class"
import { ensureBusinessOperationalAddressCountryRegistered } from "@/lib/address/register-lib-address-countries"
import {
  getOperationalAddressFormConfig,
  listSubdivisions,
  sanitizeSubdivisionForCountry,
  type OperationalAddressFormConfig,
} from "@easner/shared/postal-address-form"
import { cn } from "@/lib/utils"

export type RecipientOperationalAddressValues = {
  addressLine1: string
  city: string
  state: string
  postalCode: string
}

type Props = {
  countryCode: string
  values: RecipientOperationalAddressValues
  onChange: (patch: Partial<RecipientOperationalAddressValues>) => void
  errors?: Partial<Record<keyof RecipientOperationalAddressValues, string>>
}

const INPUT_CLASS =
  "h-12 placeholder:text-xs placeholder:text-muted-foreground/60"
const TRIGGER_CLASS =
  "flex h-12 w-full min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50 transition-[border-color]"

/** Holder address using KYB field config; country is locked to the payout corridor. */
export function RecipientOperationalAddressFields({ countryCode, values, onChange, errors }: Props) {
  const [subdivisionOpen, setSubdivisionOpen] = useState(false)
  const [countryReady, setCountryReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const code = countryCode.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) {
      setCountryReady(false)
      return
    }
    setCountryReady(false)
    void ensureBusinessOperationalAddressCountryRegistered(code)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setCountryReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [countryCode])

  const config: OperationalAddressFormConfig = useMemo(() => {
    return getOperationalAddressFormConfig(countryCode)
  }, [countryCode, countryReady])

  const subdivisions = useMemo(() => {
    if (!countryReady) return []
    return listSubdivisions(countryCode)
  }, [countryCode, countryReady])

  useEffect(() => {
    if (!countryReady) return
    const next = sanitizeSubdivisionForCountry(countryCode, values.state)
    if (next !== values.state) onChange({ state: next })
  }, [countryCode, countryReady, onChange, values.state])

  const selectedSubdivision = subdivisions.find((row) => row.value === values.state)
  const gridCols =
    config.subdivision.visible && config.postal.visible
      ? "grid-cols-1 sm:grid-cols-3"
      : config.subdivision.visible || config.postal.visible
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1"

  return (
    <>
      {config.line1.visible ? (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{config.line1.label}</label>
          <Input
            autoComplete="address-line1"
            value={values.addressLine1}
            onChange={(e) => onChange({ addressLine1: e.target.value })}
            className={cn(INPUT_CLASS, errors?.addressLine1 && "border-red-500")}
          />
          {errors?.addressLine1 ? <p className="text-xs text-red-500">{errors.addressLine1}</p> : null}
        </div>
      ) : null}

      <div className={`grid gap-4 ${gridCols}`}>
        {config.city.visible ? (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">{config.city.label}</label>
            <Input
              autoComplete="address-level2"
              value={values.city}
              onChange={(e) => onChange({ city: e.target.value })}
              className={cn(INPUT_CLASS, errors?.city && "border-red-500")}
            />
            {errors?.city ? <p className="text-xs text-red-500">{errors.city}</p> : null}
          </div>
        ) : null}

        {config.subdivision.visible ? (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">{config.subdivision.label}</label>
            {config.subdivision.mode === "dropdown" ? (
              <Popover open={subdivisionOpen} onOpenChange={setSubdivisionOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={subdivisionOpen}
                    className={cn(TRIGGER_CLASS, errors?.state && "border-red-500")}
                  >
                    <span className={cn("min-w-0 flex-1 truncate text-left", !selectedSubdivision && !values.state && "text-xs text-muted-foreground")}>
                      {selectedSubdivision?.label ??
                        (values.state ? values.state : `Select ${config.subdivision.label.toLowerCase()}`)}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 z-[60]"
                  align="start"
                  side="bottom"
                  sideOffset={4}
                >
                  <Command>
                    <CommandInput
                      placeholder={`Search ${config.subdivision.label.toLowerCase()}…`}
                      className="placeholder:text-xs"
                    />
                    <CommandList
                      className={DYNAMIC_COMBOBOX_LIST_CLASS}
                      onWheel={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                    >
                      <CommandEmpty>No match found.</CommandEmpty>
                      <CommandGroup>
                        {subdivisions.map((row) => (
                          <CommandItem
                            key={row.value}
                            value={`${row.label} ${row.value}`}
                            onSelect={() => {
                              onChange({ state: row.value })
                              setSubdivisionOpen(false)
                            }}
                          >
                            {row.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <Input
                autoComplete="address-level1"
                value={values.state}
                onChange={(e) => onChange({ state: e.target.value })}
                className={cn(INPUT_CLASS, errors?.state && "border-red-500")}
              />
            )}
            {errors?.state ? <p className="text-xs text-red-500">{errors.state}</p> : null}
          </div>
        ) : null}

        {config.postal.visible ? (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">{config.postal.label}</label>
            <Input
              autoComplete="postal-code"
              value={values.postalCode}
              onChange={(e) => onChange({ postalCode: e.target.value })}
              placeholder={config.postal.examples[0]}
              className={cn(INPUT_CLASS, errors?.postalCode && "border-red-500")}
            />
            {errors?.postalCode ? <p className="text-xs text-red-500">{errors.postalCode}</p> : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
