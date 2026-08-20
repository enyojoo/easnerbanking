"use client"

import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { isImageWarm, StableImage, warmImageUrl } from "@easner/shared"
import { normalizeProfileImageUrl } from "@/lib/image-cache"

type StableAvatarProps = {
  src?: string | null
  fallback: ReactNode
  className?: string
  imageClassName?: string
}

/** Avatar shell that avoids Radix load flicker – reuses warmed/cached profile images. */
export function StableAvatar({ src, fallback, className, imageClassName }: StableAvatarProps) {
  const normalized = normalizeProfileImageUrl(src)
  const [ready, setReady] = useState(() => Boolean(normalized && isImageWarm(normalized)))

  useEffect(() => {
    if (!normalized) {
      setReady(false)
      return
    }
    if (isImageWarm(normalized)) {
      setReady(true)
      return
    }
    let cancelled = false
    warmImageUrl(normalized, () => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [normalized])

  return (
    <div className={cn("relative flex shrink-0 items-center justify-center overflow-hidden", className)}>
      {!ready ? fallback : null}
      {normalized ? (
        <StableImage
          src={normalized}
          alt=""
          retainPrevious
          className={cn("size-full object-cover", imageClassName, !ready && "absolute inset-0")}
          onLoad={() => setReady(true)}
        />
      ) : null}
    </div>
  )
}
