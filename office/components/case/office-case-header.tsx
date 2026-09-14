"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { OfficeCaseChip } from "@/lib/case/types"

export function OfficeCaseHeader({
  backHref,
  backLabel,
  avatarUrl,
  title,
  subtitle,
  chips,
  actions,
  ids,
  tabs,
}: {
  backHref: string
  backLabel: string
  avatarUrl?: string | null
  title: string
  subtitle?: ReactNode
  chips: OfficeCaseChip[]
  actions?: ReactNode
  ids?: ReactNode
  tabs?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="min-w-0 flex-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 gap-1 px-2 text-muted-foreground">
            <Link href={backHref}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl border object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-muted text-xs font-medium text-muted-foreground">
                {title.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h1>
                {chips.map((chip) => (
                  <Badge key={chip.label} variant={chip.variant} className="px-2 py-0.5">
                    {chip.label}
                  </Badge>
                ))}
              </div>
              {subtitle ? <div className="truncate text-sm text-muted-foreground">{subtitle}</div> : null}
              {ids ? <div className="mt-1.5 flex flex-wrap gap-1.5">{ids}</div> : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
      {tabs}
    </div>
  )
}
