"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

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
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 space-x-1 overflow-x-auto" aria-label={label}>
        {filters.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => onFilterChange(option.value)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              filter === option.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 ? (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                {option.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="relative w-full max-w-[220px] shrink-0 sm:max-w-xs">
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
    </div>
  )
}
