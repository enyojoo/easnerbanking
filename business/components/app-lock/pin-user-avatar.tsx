"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export function PinUserAvatar({
  initials,
  avatarUrl,
  className,
}: {
  initials: string
  avatarUrl?: string | null
  className?: string
}) {
  const safe = initials.slice(0, 2).toUpperCase() || "?"
  const trimmed = avatarUrl?.trim() ?? ""
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setImgFailed(false)
  }, [trimmed])

  const showImage = trimmed.length > 0 && !imgFailed

  return (
    <div
      className={cn(
        "relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-foreground",
        className,
      )}
    >
      {showImage ? (
        <Image
          src={trimmed}
          alt=""
          fill
          unoptimized
          className="object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        safe
      )}
    </div>
  )
}
