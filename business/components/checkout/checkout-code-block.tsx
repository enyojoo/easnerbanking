"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function CheckoutCodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Could not copy")
    }
  }

  return (
    <div className="space-y-2">
      {label ? <p className="text-xs text-muted-foreground">{label}</p> : null}
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
          <code>{code}</code>
        </pre>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="absolute right-2 top-2 h-7 gap-1 bg-background"
          onClick={() => void copy()}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  )
}

/** One-time reveal for secrets Easner cannot show again. */
export function RevealOnceValue({ value, note }: { value: string; note?: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <p className="text-xs font-medium text-amber-950 dark:text-amber-200">
        Copy this now — it is shown only once.
      </p>
      <CheckoutCodeBlock code={value} />
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}
