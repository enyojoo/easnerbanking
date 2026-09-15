"use client"

import { useMemo, useState } from "react"
import { BankLogo } from "@easner/shared"
import { Check, ChevronsUpDown } from "lucide-react"
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
    <div className="w-full min-w-0 max-w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || sorted.length === 0}
            title={value || undefined}
            className={cn(
              "flex h-12 w-full min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs",
              "focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-ring",
              "disabled:cursor-not-allowed disabled:opacity-50 transition-[border-color]",
              !value && "text-muted-foreground",
              error && "border-red-500",
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {value ? <BankLogo bankName={value} size={18} /> : null}
              <span className="min-w-0 flex-1 truncate">{value || placeholder}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 z-[60]"
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
                    className="items-start"
                    onSelect={() => {
                      onChange(bank)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn("mr-2 mt-0.5 h-4 w-4 shrink-0", value === bank ? "opacity-100" : "opacity-0")} />
                    <BankLogo bankName={bank} size={18} className="mt-0.5" />
                    <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{bank}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
