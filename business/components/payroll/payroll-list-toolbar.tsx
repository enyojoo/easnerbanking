"use client"

import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function PayrollListToolbar<Filter extends string>({
  query,
  onQueryChange,
  queryPlaceholder,
  filter,
  onFilterChange,
  filters,
  label,
}: {
  query: string
  onQueryChange: (value: string) => void
  queryPlaceholder: string
  filter: Filter
  onFilterChange: (value: Filter) => void
  filters: Array<{ value: Filter; label: string; count?: number }>
  label: string
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative w-full lg:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          type="search"
          placeholder={queryPlaceholder}
          aria-label={queryPlaceholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1" aria-label={label}>
          {filters.map((option) => (
            <Button
              key={option.value}
              variant={filter === option.value ? "secondary" : "ghost"}
              size="sm"
              className="min-h-10 shrink-0"
              aria-pressed={filter === option.value}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
              {option.count !== undefined ? (
                <span className="ml-1.5 text-xs tabular-nums opacity-70">{option.count}</span>
              ) : null}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
