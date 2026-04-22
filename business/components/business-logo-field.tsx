"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { uploadOrganizationLogo } from "@/lib/upload-client"
import { bustBusinessLogoUrl, normalizeBusinessLogoUrl } from "@/lib/image-cache"

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
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const normalizedLogoUrl = normalizeBusinessLogoUrl(value)
  const hasLogo = Boolean(normalizedLogoUrl)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f || disabled) return

    setUploadError(null)
    setUploading(true)
    try {
      const supabase = createSupabaseBrowser()
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setUploadError("Sign in to upload.")
        return
      }
      const result = await uploadOrganizationLogo(f)
      if ("error" in result) {
        setUploadError(result.error)
        return
      }
      onChange(bustBusinessLogoUrl(result.url))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium leading-none">Logo</span>
      <div className={cn("flex flex-wrap items-center gap-2", compact && "flex-1 min-w-0 justify-end")}>
        <div
          key={hasLogo ? "logo" : "logo-empty"}
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30",
            compact ? "h-10 w-10" : "h-14 w-14",
          )}
        >
          {hasLogo ? (
            <img src={normalizedLogoUrl!} alt="" className="h-full w-full object-cover" />
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className={cn("flex gap-1", compact ? "shrink-0" : "")}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : hasLogo ? "Change" : "Upload"}
          </Button>
          {hasLogo ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={disabled || uploading}
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
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(ev) => void onFile(ev)}
        />
      </div>
      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
    </div>
  )
}
