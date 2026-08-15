"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { CountryFlag } from "@/components/flags"
import { countries } from "@/lib/countries"
import { filterCountriesForProductPicker } from "@easner/shared"
import {
  getOperationalAddressFormConfig,
  listSubdivisions,
  sanitizeSubdivisionForCountry,
  type OperationalAddressFormConfig,
} from "@easner/shared/postal-address-form"
import { ensureBusinessOperationalAddressCountryRegistered } from "@/lib/address/register-lib-address-countries"
import { SETTINGS_CONTROL_SURFACE } from "@/lib/settings-control-surface"

export type BusinessAddressValues = {
  line1: string
  city: string
  state: string
  postalCode: string
}

type Props = {
  countryCode: string
  values: BusinessAddressValues
  onChange: (patch: Partial<BusinessAddressValues>) => void
  onCountryCodeChange: (code: string) => void
  disabled?: boolean
  editing?: boolean
}

function getCountryFromCode(code: string) {
  return countries.find((c) => c.code === code)
}

export function BusinessAddressFields({
  countryCode,
  values,
  onChange,
  onCountryCodeChange,
  disabled = false,
  editing = false,
}: Props) {
  const [countryOpen, setCountryOpen] = useState(false)
  const [subdivisionOpen, setSubdivisionOpen] = useState(false)
  const [countryReady, setCountryReady] = useState(false)

  const countriesForPicker = useMemo(() => {
    const base = filterCountriesForProductPicker(countries, "business")
    const cur = getCountryFromCode(countryCode)
    if (cur && !base.some((b) => b.code === cur.code)) {
      return [cur, ...base]
    }
    return base
  }, [countryCode])

  useEffect(() => {
    let cancelled = false
    const code = countryCode.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) {
      setCountryReady(false)
      return
    }
    setCountryReady(false)
    void ensureBusinessOperationalAddressCountryRegistered(code).then(() => {
      if (!cancelled) setCountryReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [countryCode])

  const config: OperationalAddressFormConfig | null = useMemo(() => {
    if (!countryReady || !/^[A-Z]{2}$/.test(countryCode.trim().toUpperCase())) return null
    try {
      return getOperationalAddressFormConfig(countryCode)
    } catch {
      return null
    }
  }, [countryCode, countryReady])

  const subdivisions = useMemo(() => {
    if (!countryReady) return []
    return listSubdivisions(countryCode)
  }, [countryCode, countryReady])

  const selectedCountry = getCountryFromCode(countryCode)
  const isEditing = editing && !disabled
  const gridCols =
    config && config.subdivision.visible && config.postal.visible
      ? "md:grid-cols-3"
      : config && (config.subdivision.visible || config.postal.visible)
        ? "md:grid-cols-2"
        : "md:grid-cols-1"

  const handleCountryChange = async (code: string) => {
    await ensureBusinessOperationalAddressCountryRegistered(code)
    const nextConfig = getOperationalAddressFormConfig(code)
    const patch: Partial<BusinessAddressValues> = {}
    if (!nextConfig.subdivision.visible || nextConfig.subdivision.mode === "dropdown") {
      patch.state = sanitizeSubdivisionForCountry(code, values.state)
    }
    if (!nextConfig.postal.visible) {
      patch.postalCode = ""
    }
    onCountryCodeChange(code)
    if (Object.keys(patch).length > 0) onChange(patch)
    setCountryOpen(false)
  }

  const selectedSubdivision = subdivisions.find((row) => row.value === values.state)

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] md:items-end">
        <div className="space-y-2">
          <Label>Country</Label>
          {isEditing ? (
            <Popover open={countryOpen} onOpenChange={setCountryOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={countryOpen}
                  className={`h-10 w-full justify-between font-normal ${SETTINGS_CONTROL_SURFACE}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {selectedCountry ? (
                      <>
                        <CountryFlag code={selectedCountry.code} size={22} />
                        <span className="truncate">{selectedCountry.name}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Select country</span>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search country..." />
                  <CommandList className="max-h-[200px]">
                    <CommandEmpty>No country found.</CommandEmpty>
                    <CommandGroup>
                      {countriesForPicker.map((c) => (
                        <CommandItem key={c.code} value={c.name} onSelect={() => void handleCountryChange(c.code)}>
                          <div className="flex w-full items-center gap-2">
                            <CountryFlag code={c.code} size={22} />
                            <span className="flex-1">{c.name}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled
              tabIndex={-1}
              className={`h-10 w-full justify-between font-normal ${SETTINGS_CONTROL_SURFACE}`}
              aria-readonly="true"
            >
              <span className="flex min-w-0 items-center gap-2">
                {selectedCountry ? (
                  <>
                    <CountryFlag code={selectedCountry.code} size={22} />
                    <span className="truncate">{selectedCountry.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
            </Button>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="street">{config?.line1.label ?? "Street address"}</Label>
          <Input
            id="street"
            autoComplete="address-line1"
            className={SETTINGS_CONTROL_SURFACE}
            value={values.line1}
            onChange={(e) => onChange({ line1: e.target.value })}
            disabled={!isEditing}
          />
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${gridCols}`}>
        {config?.city.visible !== false ? (
          <div className="space-y-2">
            <Label htmlFor="city">{config?.city.label ?? "City"}</Label>
            <Input
              id="city"
              autoComplete="address-level2"
              className={SETTINGS_CONTROL_SURFACE}
              value={values.city}
              onChange={(e) => onChange({ city: e.target.value })}
              disabled={!isEditing}
            />
          </div>
        ) : null}

        {config?.subdivision.visible ? (
          <div className="space-y-2">
            <Label htmlFor="state">{config.subdivision.label}</Label>
            {config.subdivision.mode === "dropdown" ? (
              isEditing ? (
                <Popover open={subdivisionOpen} onOpenChange={setSubdivisionOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="state"
                      variant="outline"
                      role="combobox"
                      aria-expanded={subdivisionOpen}
                      className={`h-10 w-full justify-between font-normal ${SETTINGS_CONTROL_SURFACE}`}
                    >
                      <span className="truncate">
                        {selectedSubdivision?.label ?? (values.state ? values.state : `Select ${config.subdivision.label.toLowerCase()}`)}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={`Search ${config.subdivision.label.toLowerCase()}...`} />
                      <CommandList className="max-h-[200px]">
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
                  id="state"
                  className={SETTINGS_CONTROL_SURFACE}
                  value={selectedSubdivision?.label ?? values.state}
                  disabled
                  readOnly
                />
              )
            ) : (
              <Input
                id="state"
                autoComplete="address-level1"
                className={SETTINGS_CONTROL_SURFACE}
                value={values.state}
                onChange={(e) => onChange({ state: e.target.value })}
                disabled={!isEditing}
              />
            )}
          </div>
        ) : null}

        {config?.postal.visible ? (
          <div className="space-y-2">
            <Label htmlFor="zipCode">{config.postal.label}</Label>
            <Input
              id="zipCode"
              autoComplete="postal-code"
              className={SETTINGS_CONTROL_SURFACE}
              value={values.postalCode}
              onChange={(e) => onChange({ postalCode: e.target.value })}
              disabled={!isEditing}
              placeholder={config.postal.examples[0] ?? undefined}
            />
          </div>
        ) : null}
      </div>
    </>
  )
}
