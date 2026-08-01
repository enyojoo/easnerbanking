import { cn } from "@/lib/utils"

type PageIntroVariant = "page" | "hero" | "tab" | "section"

type PageIntroProps = {
  title: string
  description: string
  variant?: PageIntroVariant
  className?: string
}

const titleClass: Record<PageIntroVariant, string> = {
  hero: "text-3xl font-semibold text-foreground",
  page: "text-2xl font-semibold text-foreground",
  tab: "text-lg font-semibold tracking-tight",
  section: "text-lg font-semibold",
}

export function PageIntro({ title, description, variant = "page", className }: PageIntroProps) {
  const Tag = variant === "section" ? "h3" : variant === "tab" ? "h2" : "h1"

  return (
    <div className={cn("space-y-1", className)}>
      <Tag className={titleClass[variant]}>{title}</Tag>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
