import type { ReactNode } from "react"
import { CardDescription, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type SectionHeaderProps = {
  title: ReactNode
  description?: string
  actions?: ReactNode
  className?: string
}

export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn(actions ? "flex items-start justify-between gap-4" : undefined, className)}>
      <div className="min-w-0 space-y-1.5">
        {typeof title === "string" ? <CardTitle>{title}</CardTitle> : title}
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}
