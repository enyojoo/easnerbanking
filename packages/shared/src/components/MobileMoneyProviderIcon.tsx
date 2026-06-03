import type { CSSProperties } from "react"
import { cn } from "../utils/cn"
import {
  getMobileMoneyProviderPublicUrl,
  hasMobileMoneyProviderIcon,
  normalizeMobileMoneyProviderKey,
} from "../mobile-money-icons"

export type MobileMoneyProviderIconProps = {
  provider: string
  size?: number | string
  className?: string
  style?: CSSProperties
  title?: string
}

export function MobileMoneyProviderIcon({
  provider,
  size = 18,
  className,
  style,
  title,
}: MobileMoneyProviderIconProps) {
  const src = getMobileMoneyProviderPublicUrl(provider)
  const px = typeof size === "number" ? size : Number.parseInt(String(size), 10) || 18

  if (!src) {
    const key = normalizeMobileMoneyProviderKey(provider)
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground",
          className,
        )}
        style={{ width: px, height: px, ...style }}
        title={title ?? provider}
        aria-hidden={!title}
      >
        {(key ?? provider).slice(0, 2).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      title={title ?? provider}
      className={cn("shrink-0 rounded-full object-cover", className)}
      style={{ width: px, height: px, ...style }}
    />
  )
}

export { hasMobileMoneyProviderIcon, normalizeMobileMoneyProviderKey }
