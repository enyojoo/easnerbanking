"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { X, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { uploadProfileAvatar } from "@/lib/upload-client"

export function ProfilePhotoField({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const hasImage = Boolean(value?.trim())

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
      const result = await uploadProfileAvatar(f)
      if ("error" in result) {
        setUploadError(result.error)
        return
      }
      onChange(result.url)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium leading-none">Profile photo</span>
      <div className="flex flex-wrap items-center gap-2">
        <div
          key={hasImage ? "photo" : "photo-empty"}
          className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted/30"
        >
          {hasImage ? (
            <img src={value!} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : hasImage ? "Change" : "Upload"}
          </Button>
          {hasImage ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={disabled || uploading}
              onClick={() => onChange(null)}
              aria-label="Remove photo"
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
