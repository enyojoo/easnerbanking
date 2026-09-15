"use client"

import type { CSSProperties } from "react"
import { cn } from "../utils/cn"
import { getBankLogoPublicUrl, normalizeBankLogoKey } from "../bank-icons"
import { StableImage } from "./StableImage"

export type BankLogoProps = {
  bankName: string
  size?: number | string
  className?: string
  style?: CSSProperties
  title?: string
}

export function BankLogo({ bankName, size = 18, className, style, title }: BankLogoProps) {
  const src = getBankLogoPublicUrl(bankName)
  const px = typeof size === "number" ? size : Number.parseInt(String(size), 10) || 18

  if (!src) {
    const key = normalizeBankLogoKey(bankName)
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground",
          className,
        )}
        style={{ width: px, height: px, ...style }}
        title={title ?? bankName}
        aria-hidden={!title}
      >
        {(key ?? bankName).slice(0, 2).toUpperCase()}
      </span>
    )
  }

  return (
    <StableImage
      src={src}
      alt=""
      title={title ?? bankName}
      width={px}
      height={px}
      decoding="async"
      loading="eager"
      retainPrevious
      className={cn("shrink-0 rounded-full object-cover bg-white", className)}
      style={{ width: px, height: px, ...style }}
    />
  )
}
