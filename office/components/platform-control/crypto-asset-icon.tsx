"use client"

import { StableImage, getTokenIconUrl } from "@easner/shared"

export function CryptoAssetIcon({ code, size = 22 }: { code: string; size?: number }) {
  const upper = code.toUpperCase()
  const src = getTokenIconUrl(upper)
  if (src) {
    return (
      <StableImage
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
      />
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {upper.slice(0, 2)}
    </span>
  )
}
