"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CopyId({ id, className }: { id: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-auto gap-1.5 px-1.5 py-0.5 font-mono text-xs", className)}
      onClick={async () => {
        await navigator.clipboard.writeText(id)
        setCopied(true)
        toast.success("Copied")
        window.setTimeout(() => setCopied(false), 1200)
      }}
    >
      <span className="max-w-[16rem] truncate">{id}</span>
      <Copy className="h-3 w-3 shrink-0" />
      <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
    </Button>
  )
}
