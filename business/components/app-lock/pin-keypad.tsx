"use client"

import { Delete } from "lucide-react"
import { cn } from "@/lib/utils"

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const

export function PinKeypad({
  onDigit,
  onBackspace,
  disabled,
  className,
}: {
  onDigit: (d: string) => void
  onBackspace: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[280px] select-none", className)}>
      {ROWS.map((row) => (
        <div key={row.join("")} className="mb-3 flex justify-center gap-6">
          {row.map((d) => (
            <button
              key={d}
              type="button"
              disabled={disabled}
              className="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-semibold text-foreground transition hover:bg-muted active:scale-95 disabled:opacity-40"
              onClick={() => onDigit(d)}
            >
              {d}
            </button>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-6">
        <span className="h-14 w-14" aria-hidden />
        <button
          type="button"
          disabled={disabled}
          className="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-semibold text-foreground transition hover:bg-muted active:scale-95 disabled:opacity-40"
          onClick={() => onDigit("0")}
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled}
          className="flex h-14 w-14 items-center justify-center rounded-full text-destructive transition hover:bg-destructive/10 active:scale-95 disabled:opacity-40"
          onClick={onBackspace}
          aria-label="Backspace"
        >
          <Delete className="h-7 w-7" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
