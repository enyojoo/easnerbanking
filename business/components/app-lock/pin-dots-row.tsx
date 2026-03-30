"use client"

import { cn } from "@/lib/utils"

const LEN = 4

export function PinDotsRow({ filledLength }: { filledLength: number }) {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length: LEN }, (_, i) => {
        const filled = i < filledLength
        const active = i === filledLength
        return (
          <div
            key={i}
            className={cn(
              "flex h-14 w-12 items-center justify-center rounded-lg border-2 text-2xl font-semibold tabular-nums transition-colors",
              active && "border-primary ring-2 ring-primary/30",
              !active && !filled && "border-input bg-background",
              filled && "border-primary/60 bg-muted/40",
            )}
            aria-current={active ? "step" : undefined}
          >
            {filled ? <span className="text-foreground">•</span> : null}
          </div>
        )
      })}
    </div>
  )
}
