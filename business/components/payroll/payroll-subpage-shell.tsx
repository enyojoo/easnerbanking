import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ReactNode } from "react"

export function PayrollSubpageShell({
  backHref,
  backLabel,
  title,
  description,
  leading,
  status,
  actions,
  children,
}: {
  backHref: string
  backLabel: string
  section: string
  sectionHref?: string
  current?: string
  title: string
  description?: string
  leading?: ReactNode
  status?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {leading ? <div className="shrink-0">{leading}</div> : null}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
                {status}
              </div>
              {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      </div>
      {children}
    </div>
  )
}
