"use client"

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react"
import { cn } from "../utils/cn"
import { isImageWarm, markImageWarm, warmImageUrl } from "../image/image-warm-cache.web"

export type StableImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Keep the last loaded image visible while a new `src` warms (avatars/logos). */
  retainPrevious?: boolean
}

export function StableImage({
  src,
  className,
  retainPrevious = false,
  onLoad,
  onError,
  ...props
}: StableImageProps) {
  const trimmed = typeof src === "string" ? src.trim() : ""
  const previousSrcRef = useRef("")
  const [displaySrc, setDisplaySrc] = useState(trimmed)
  const [visible, setVisible] = useState(() => trimmed.length > 0 && isImageWarm(trimmed))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!trimmed) {
      previousSrcRef.current = ""
      setDisplaySrc("")
      setVisible(false)
      return
    }

    if (isImageWarm(trimmed)) {
      previousSrcRef.current = trimmed
      setDisplaySrc(trimmed)
      setVisible(true)
      return
    }

    let cancelled = false
    warmImageUrl(trimmed, () => {
      if (cancelled) return
      previousSrcRef.current = trimmed
      setDisplaySrc(trimmed)
      setVisible(true)
    })

    if (retainPrevious && previousSrcRef.current && previousSrcRef.current !== trimmed) {
      setDisplaySrc(previousSrcRef.current)
      setVisible(true)
    } else {
      setDisplaySrc(trimmed)
      setVisible(false)
    }

    return () => {
      cancelled = true
    }
  }, [trimmed, retainPrevious])

  if (!displaySrc || failed) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={displaySrc}
      className={cn(className, !visible && "opacity-0")}
      decoding="async"
      draggable={props.draggable ?? false}
      onLoad={(event) => {
        markImageWarm(displaySrc)
        previousSrcRef.current = displaySrc
        setVisible(true)
        onLoad?.(event)
      }}
      onError={(event) => {
        setFailed(true)
        onError?.(event)
      }}
    />
  )
}
