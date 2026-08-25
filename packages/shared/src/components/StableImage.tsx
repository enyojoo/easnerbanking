"use client"

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react"
import { isImageWarm, markImageWarm, warmImageUrl } from "../image/image-warm-cache.web"

export type StableImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Keep the last loaded image visible while a new `src` warms (avatars/logos). */
  retainPrevious?: boolean
}

/**
 * <img> that trusts the browser.
 *
 * An earlier version rendered every image at `opacity-0` until a JS-side
 * warm-set said the URL had loaded — which meant even images sitting in the
 * HTTP disk cache (flags are `immutable, max-age=1y`) stayed invisible until
 * a JS round trip, and every surface popped in raggedly on each new tab.
 * The gate also spawned a SECOND `new Image()` for a src already in the DOM.
 *
 * Now the image renders immediately: cached assets paint in the same frame,
 * cold assets appear exactly when the browser has them (native behavior, no
 * added delay). The JS warm-set is only used for `retainPrevious` swaps —
 * when `src` changes on a mounted avatar/logo, the previous image stays
 * visible until the replacement has actually loaded, so there is no blank
 * gap — and to skip redundant warming elsewhere.
 */
export function StableImage({
  src,
  className,
  retainPrevious = false,
  onLoad,
  onError,
  ...props
}: StableImageProps) {
  const trimmed = typeof src === "string" ? src.trim() : ""
  const previousSrcRef = useRef(trimmed)
  const [displaySrc, setDisplaySrc] = useState(trimmed)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!trimmed) {
      previousSrcRef.current = ""
      setDisplaySrc("")
      return
    }

    const previous = previousSrcRef.current
    if (
      retainPrevious &&
      previous &&
      previous !== trimmed &&
      !isImageWarm(trimmed)
    ) {
      // Src swap on a mounted image: keep showing the old one, warm the new
      // one off-DOM, swap when it can paint instantly.
      let cancelled = false
      warmImageUrl(trimmed, () => {
        if (cancelled) return
        previousSrcRef.current = trimmed
        setDisplaySrc(trimmed)
      })
      return () => {
        cancelled = true
      }
    }

    previousSrcRef.current = trimmed
    setDisplaySrc(trimmed)
  }, [trimmed, retainPrevious])

  if (!displaySrc || failed) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={displaySrc}
      className={className}
      draggable={props.draggable ?? false}
      onLoad={(event) => {
        markImageWarm(displaySrc)
        previousSrcRef.current = displaySrc
        onLoad?.(event)
      }}
      onError={(event) => {
        setFailed(true)
        onError?.(event)
      }}
    />
  )
}
