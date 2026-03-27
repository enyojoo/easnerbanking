"use client"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"

const MAX_BYTES = 2 * 1024 * 1024

export function BusinessLogoField({
  value,
  onChange,
  disabled,
  className,
  compact,
}: {
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  className?: string
  /** Tighter layout for the name+logo row */
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith("image/")) return
    if (f.size > MAX_BYTES) return
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result as string)
    reader.readAsDataURL(f)
    e.target.value = ""
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium leading-none">Logo</span>
      <div className={cn("flex items-center gap-2", compact && "flex-1 min-w-0 justify-end")}>
        <div
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30",
            compact ? "h-10 w-10" : "h-14 w-14",
          )}
        >
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className={cn("flex gap-1", compact ? "shrink-0" : "")}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {value ? "Change" : "Upload"}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={disabled}
              onClick={() => onChange(null)}
              aria-label="Remove logo"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled}
          onChange={onFile}
        />
      </div>
    </div>
  )
}
