import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type PageIntroVariant = "page" | "hero" | "tab" | "section"

type PageIntroProps = {
  title: string
  description: string
  variant?: PageIntroVariant
  className?: string
  icon?: ReactNode
}

const titleClass: Record<PageIntroVariant, string> = {
  hero: "text-3xl font-semibold text-foreground",
  page: "text-2xl font-semibold text-foreground",
  tab: "text-lg font-semibold tracking-tight",
  section: "text-lg font-semibold",
}

export function PageIntro({ title, description, variant = "page", className, icon }: PageIntroProps) {
  const Tag = variant === "section" ? "h3" : variant === "tab" ? "h2" : "h1"

  return (
    <div className={cn("space-y-1", className)}>
      <Tag className={cn(titleClass[variant], icon && "flex items-center gap-2")}>
        {icon ? <span className="shrink-0 text-muted-foreground [&>svg]:size-5">{icon}</span> : null}
        {title}
      </Tag>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
