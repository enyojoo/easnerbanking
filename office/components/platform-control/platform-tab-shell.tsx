import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type PlatformControlTabShellProps = {
  title: string
  description: string
  children: ReactNode
  actions?: ReactNode
  /** @default "max-w-6xl" */
  maxWidth?: "max-w-3xl" | "max-w-6xl" | "max-w-none"
}

export function PlatformControlTabShell({
  title,
  description,
  children,
  actions,
  maxWidth = "max-w-6xl",
}: PlatformControlTabShellProps) {
  return (
    <div className={cn("space-y-6", maxWidth)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <p className="text-gray-600 text-sm mt-1">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  )
}
