"use client"

import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { SETTINGS_COMBOBOX_TRIGGER_CLASS } from "@/lib/settings-control-surface"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string; aliases?: string }

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: readonly Option[]
  placeholder: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  /** Keep the selected label on one line (tax ID type). */
  nowrap?: boolean
}

export function GridKybEnumSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  invalid,
  className,
  nowrap,
}: Props) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value.toUpperCase() === value.trim().toUpperCase())

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
          className={cn(SETTINGS_COMBOBOX_TRIGGER_CLASS, invalid && "border-destructive", className)}
        >
          <span className={cn(nowrap ? "whitespace-nowrap" : "truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandEmpty>No match found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.value} ${option.label} ${option.aliases ?? ""}`}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <span className="flex-1">{option.label}</span>
                  {selected?.value === option.value ? <Check className="size-4" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
