"use client"

import { StableImage } from "@easner/shared"
import { normalizeBusinessLogoUrl, normalizeProfileImageUrl } from "@easner/shared/image/versioned-image-url"
import { cn } from "@/lib/utils"

type OfficeStablePhotoProps = {
  src?: string | null
  kind?: "profile" | "logo"
  className?: string
}

/** Cached avatar/logo that paints from HTTP cache without a load flicker. */
export function OfficeStablePhoto({ src, kind = "profile", className }: OfficeStablePhotoProps) {
  const url =
    kind === "logo" ? normalizeBusinessLogoUrl(src) : normalizeProfileImageUrl(src)
  if (!url) return null
  return (
    <StableImage
      src={url}
      alt=""
      retainPrevious
      className={cn("object-cover", className)}
    />
  )
}
