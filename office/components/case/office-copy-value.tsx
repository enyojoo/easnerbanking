"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { displayText } from "@/lib/case/status"
import { cn } from "@/lib/utils"

export function OfficeCopyValue({
  label,
  value,
  mono = true,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const shown = displayText(value)
  const raw = value?.trim() || ""

  async function copy() {
    if (!raw) return
    await navigator.clipboard.writeText(raw)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="grid grid-cols-[minmax(7rem,34%)_1fr] items-start gap-3 py-2 text-sm first:pt-0 last:pb-0">
      <span className="pt-0.5 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center justify-end gap-1 sm:justify-start">
        <span className={cn("min-w-0 break-all", mono && "font-mono text-xs")}>{shown}</span>
        {raw ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={() => void copy()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="sr-only">Copy {label}</span>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function OfficeCopyChip({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  const [copied, setCopied] = useState(false)
  const raw = value?.trim() || ""
  if (!raw) return null
  const short = raw.length > 16 ? `${raw.slice(0, 6)}…${raw.slice(-4)}` : raw

  async function copy() {
    await navigator.clipboard.writeText(raw)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      type="button"
      title={raw}
      onClick={() => void copy()}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-left transition-colors hover:bg-muted"
    >
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-[11px] text-foreground">{short}</span>
      {copied ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />}
      <span className="sr-only">Copy {label}</span>
    </button>
  )
}
