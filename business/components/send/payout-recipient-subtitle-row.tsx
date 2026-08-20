"use client"

import { cn } from "@/lib/utils"

/** `Label • detail` – matches mobile PayoutSubtitleRow rhythm. */
export function PayoutRecipientSubtitleRow({
  left,
  right,
  className,
}: {
  left: string
  right: string
  className?: string
}) {
  const L = String(left || "").trim()
  const R = String(right || "").trim()
  const textCn = cn("text-sm text-muted-foreground", className)

  if (!L && !R) return null
  if (!L) {
    return <p className={cn("truncate", textCn)}>{R}</p>
  }
  if (!R) {
    return <p className={cn("truncate", textCn)}>{L}</p>
  }

  return (
    <p className={cn("flex min-w-0 items-center gap-1 truncate", textCn)}>
      <span className="min-w-0 truncate">{L}</span>
      <span className="shrink-0">•</span>
      <span className="shrink-0">{R}</span>
    </p>
  )
}
