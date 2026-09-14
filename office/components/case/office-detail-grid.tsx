"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function OfficeDetailRow({
  label,
  children,
  mono,
}: {
  label: string
  children: ReactNode
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[minmax(7rem,34%)_1fr] items-start gap-3 py-2 text-sm first:pt-0 last:pb-0">
      <span className="pt-0.5 text-muted-foreground">{label}</span>
      <div className={cn("min-w-0 break-words text-right font-medium text-foreground sm:text-left", mono && "font-mono text-xs font-normal")}>
        {children}
      </div>
    </div>
  )
}

export function OfficeSection({
  title,
  description,
  children,
  framed = true,
  divide = true,
  action,
}: {
  title: string
  description?: string
  children: ReactNode
  framed?: boolean
  divide?: boolean
  action?: ReactNode
}) {
  const body = (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className={divide ? "divide-y divide-border/60" : "space-y-3"}>{children}</div>
    </>
  )
  if (!framed) return <div>{body}</div>
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-[var(--shadow-soft)] dark:shadow-none">
      {body}
    </section>
  )
}
