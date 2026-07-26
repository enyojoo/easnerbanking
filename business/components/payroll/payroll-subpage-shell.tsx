import Link from "next/link"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

export function PayrollSubpageShell({
  backHref,
  backLabel,
  section,
  sectionHref,
  current,
  title,
  description,
  leading,
  status,
  actions,
  children,
  maxWidth = "max-w-6xl",
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
  maxWidth?: "max-w-5xl" | "max-w-6xl" | "max-w-7xl"
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-7 sm:px-6 sm:py-8", maxWidth)}>
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild>
        <Link href={backHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Link>
      </Button>
      <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <Link href="/payroll" className="hover:text-foreground">Payroll</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <Link href={sectionHref ?? backHref} className="hover:text-foreground">{section}</Link>
        {current ? (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-foreground">{current}</span>
          </>
        ) : null}
      </nav>
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
      {children}
    </div>
  )
}
