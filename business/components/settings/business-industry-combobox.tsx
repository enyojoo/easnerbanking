"use client"

import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { BUSINESS_INDUSTRY_GROUPS, getIndustryById } from "@/lib/business-industries"
import { SETTINGS_COMBOBOX_TRIGGER_CLASS } from "@/lib/settings-control-surface"

type Props = {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  className?: string
  id?: string
  "aria-labelledby"?: string
}

export function BusinessIndustryCombobox({
  value,
  onChange,
  disabled,
  className,
  id,
  "aria-labelledby": ariaLabelledby,
}: Props) {
  const [open, setOpen] = useState(false)
  const trimmed = String(value || "").trim()
  const selected = getIndustryById(trimmed)
  const legacyUnknown = Boolean(trimmed && !selected)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          aria-labelledby={ariaLabelledby}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            SETTINGS_COMBOBOX_TRIGGER_CLASS,
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {selected
              ? selected.label
              : legacyUnknown
                ? "Previous value not in list – choose an option"
                : "Select industry"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command className="max-h-[320px]">
          <CommandInput placeholder="Search industry…" />
          <div
            className="max-h-[260px] overflow-y-auto overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <CommandList className="max-h-none">
              <CommandEmpty>No industry found.</CommandEmpty>
              {BUSINESS_INDUSTRY_GROUPS.map((group) => (
                <CommandGroup key={group.id} heading={group.label}>
                  {group.industries.map((ind) => (
                    <CommandItem
                      key={ind.id}
                      value={`${group.label} ${ind.label} ${ind.id}`}
                      onSelect={() => {
                        onChange(ind.id)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn("mr-2 h-4 w-4 shrink-0", value === ind.id ? "opacity-100" : "opacity-0")}
                      />
                      {ind.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
