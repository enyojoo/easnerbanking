"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DYNAMIC_COMBOBOX_LIST_CLASS } from "@/lib/combobox-list-class"
import { cn } from "@/lib/utils"

type Props = {
  banks: string[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: boolean
  placeholder?: string
}

export function PayoutBankCombobox({
  banks,
  value,
  onChange,
  disabled,
  error,
  placeholder = "Select bank",
}: Props) {
  const [open, setOpen] = useState(false)
  const sorted = useMemo(() => [...banks].sort((a, b) => a.localeCompare(b)), [banks])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || sorted.length === 0}
          className={cn(
            "h-12 w-full min-w-0 justify-between overflow-hidden font-normal",
            !value && "text-muted-foreground",
            error && "border-red-500",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 z-[60]"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <Command>
          <CommandInput placeholder="Search bank…" className="placeholder:text-xs" />
          <CommandList
            className={DYNAMIC_COMBOBOX_LIST_CLASS}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <CommandEmpty>No bank found.</CommandEmpty>
            <CommandGroup>
              {sorted.map((bank) => (
                <CommandItem
                  key={bank}
                  value={bank}
                  className="min-w-0"
                  onSelect={() => {
                    onChange(bank)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === bank ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{bank}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
