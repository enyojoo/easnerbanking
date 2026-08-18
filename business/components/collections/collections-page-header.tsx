import type { ReactNode } from "react"
import { PageIntro } from "@/components/copy/page-intro"
import { Badge } from "@/components/ui/badge"

export function CollectionsPageHeader({
  title,
  intro,
  chips,
  actions,
}: {
  title: string
  intro: string
  chips?: string[]
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 space-y-2">
        <PageIntro title={title} description={intro} variant="page" />
        {chips && chips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Badge key={chip} variant="secondary">
                {chip}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
