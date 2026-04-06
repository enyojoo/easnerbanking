"use client"

import { memo } from "react"
import { Delete } from "lucide-react"
import { cn } from "@/lib/utils"

const KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  "0",
  "backspace",
] as const

/** Snappy touch feedback: no color transition (avoids laggy :active on mobile); hover only for fine pointers. */
const keyBase =
  "flex min-h-[52px] w-full touch-manipulation items-center justify-center bg-background text-xl font-semibold tabular-nums text-foreground [-webkit-tap-highlight-color:transparent] active:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/90 sm:min-h-14 sm:text-2xl"

export const AmountKeypad = memo(function AmountKeypad({
  onDigit,
  onDecimal,
  onBackspace,
  disabled,
  className,
}: {
  onDigit: (d: string) => void
  onDecimal: () => void
  onBackspace: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "w-full max-w-full select-none overflow-hidden rounded-2xl border border-border bg-border shadow-sm ring-1 ring-border/40 dark:ring-border/25",
        className,
      )}
      role="group"
      aria-label="Amount keypad"
    >
      <div className="grid grid-cols-3 gap-px">
        {KEYS.map((k) => {
          if (k === "backspace") {
            return (
              <button
                key={k}
                type="button"
                disabled={disabled}
                className={cn(
                  keyBase,
                  "text-destructive [@media(hover:hover)_and_(pointer:fine)]:hover:bg-destructive/10 active:bg-destructive/20",
                )}
                onClick={onBackspace}
                aria-label="Backspace"
              >
                <Delete className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.5} />
              </button>
            )
          }
          if (k === ".") {
            return (
              <button
                key={k}
                type="button"
                disabled={disabled}
                className={keyBase}
                onClick={onDecimal}
              >
                .
              </button>
            )
          }
          return (
            <button
              key={k}
              type="button"
              disabled={disabled}
              className={keyBase}
              onClick={() => onDigit(k)}
            >
              {k}
            </button>
          )
        })}
      </div>
    </div>
  )
})
