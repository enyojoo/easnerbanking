"use client"

import { getTokenIconUrl } from "@/lib/crypto-icons"

export function CryptoAssetIcon({ code, size = 22 }: { code: string; size?: number }) {
  const upper = code.toUpperCase()
  const src = getTokenIconUrl(upper)
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        loading="lazy"
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
