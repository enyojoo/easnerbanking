import type { CSSProperties } from "react"
import { cn } from "../utils/cn"
import { getCountryCodeForCurrency } from "../flags/currency-mapping"
import { getFlagBundledSrc } from "../flags/flag-assets.web.manifest"
import { flagIsoForCurrency, getFlagPublicUrl, hasFlagAsset, normalizeFlagIso } from "../flags/flag-source"
import { FLAG_BORDER_RADIUS_PX, FLAG_WEB_DECORATIVE_CLASS } from "../flags/flag-styles"

const flagRadiusClass = "rounded-[2px]"

export type CountryFlagProps = {
  /** ISO 3166-1 alpha-2 */
  code: string
  size?: number | string
  className?: string
  style?: CSSProperties
  title?: string
}

function flagDimensions(size: number | string | undefined): { width: number; height: number } {
  const width = typeof size === "number" ? size : Number.parseInt(String(size), 10) || 24
  return { width, height: Math.round(width * 0.75) }
}

export function CountryFlag({ code, size = 24, className, style, title }: CountryFlagProps) {
  const upper = normalizeFlagIso(code)
  const { width, height } = flagDimensions(size)
  const src = getFlagBundledSrc(upper) ?? getFlagPublicUrl(upper)

  if (!src) {
    return (
      <span
        className={cn(
          `inline-flex shrink-0 items-center justify-center ${flagRadiusClass} bg-muted text-[10px] font-medium text-muted-foreground`,
          className
        )}
        style={{ width, height, ...style }}
        title={title ?? upper}
        role="img"
        aria-label={title ?? upper}
      >
        {upper.slice(0, 2) || "--"}
      </span>
    )
  }

  const label = title ?? upper

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(FLAG_WEB_DECORATIVE_CLASS, flagRadiusClass, className)}
      style={{
        width,
        height,
        borderRadius: FLAG_BORDER_RADIUS_PX,
        backgroundImage: `url(${JSON.stringify(src)})`,
        ...style,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    />
  )
}

export type CurrencyFlagProps = {
  currency: string
  size?: number | string
  className?: string
  style?: CSSProperties
  title?: string
  /** When set, used if currency is not mapped to a bundled flag */
  fallbackSvg?: string | null
}

export function CurrencyFlag({
  currency,
  size = 24,
  className,
  style,
  title,
  fallbackSvg,
}: CurrencyFlagProps) {
  const code = currency.trim().toUpperCase()
  const iso = flagIsoForCurrency(code) || getCountryCodeForCurrency(code) || ""

  if (iso && hasFlagAsset(iso)) {
    return <CountryFlag code={iso} size={size} className={className} style={style} title={title ?? code} />
  }

  if (fallbackSvg) {
    const { width, height } = flagDimensions(size)
    return (
      <span
        className={cn("inline-flex shrink-0 items-center [&_svg]:size-full", className)}
        style={{ width, height, ...style }}
        title={title ?? code}
        dangerouslySetInnerHTML={{ __html: fallbackSvg }}
      />
    )
  }

  const { width, height } = flagDimensions(size)
  return (
    <span
      className={cn(
        `inline-flex shrink-0 items-center justify-center ${flagRadiusClass} bg-muted text-[10px] font-medium text-muted-foreground`,
        className
      )}
      style={{ width, height, ...style }}
      title={title ?? code}
    >
      {code.slice(0, 2)}
    </span>
  )
}
