import type { CSSProperties } from "react"
import { cn } from "../utils/cn"
import { getCountryCodeForCurrency } from "../flags/currency-mapping"
import { getFlagBundledSrc } from "../flags/flag-assets.web.manifest"
import { flagIsoForCurrency, getFlagPublicUrl, hasFlagAsset, normalizeFlagIso } from "../flags/flag-source"
import {
  FLAG_BORDER_RADIUS_PX,
  FLAG_FILL_CLASS,
  FLAG_WEB_DECORATIVE_CLASS,
  flagFillsParentClass,
  resolveFlagBoxSizeFromStyle,
} from "../flags/flag-styles"

const flagRadiusClass = "rounded-[2px]"

export type CountryFlagProps = {
  /** ISO 3166-1 alpha-2 */
  code: string
  size?: number | string
  className?: string
  style?: CSSProperties
  title?: string
}

export function CountryFlag({ code, size = 24, className, style, title }: CountryFlagProps) {
  const upper = normalizeFlagIso(code)
  const fillParent = flagFillsParentClass(className)
  const { width, height } = resolveFlagBoxSizeFromStyle(size, style)
  const src = getFlagBundledSrc(upper) ?? getFlagPublicUrl(upper)

  if (!src) {
    return (
      <span
        className={cn(
          `inline-flex shrink-0 items-center justify-center overflow-hidden ${flagRadiusClass} bg-muted text-[10px] font-medium text-muted-foreground`,
          fillParent && FLAG_FILL_CLASS,
          className
        )}
        style={fillParent ? style : { width, height, ...style }}
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
      className={cn(
        FLAG_WEB_DECORATIVE_CLASS,
        flagRadiusClass,
        fillParent && FLAG_FILL_CLASS,
        className
      )}
      style={{
        ...(fillParent ? {} : { width, height }),
        borderRadius: FLAG_BORDER_RADIUS_PX,
        backgroundImage: `url(${JSON.stringify(src)})`,
        backgroundSize: "cover",
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
  const fillParent = flagFillsParentClass(className)
  const { width, height } = resolveFlagBoxSizeFromStyle(size, style)

  if (iso && hasFlagAsset(iso)) {
    return <CountryFlag code={iso} size={size} className={className} style={style} title={title ?? code} />
  }

  if (fallbackSvg) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center overflow-hidden [&_svg]:size-full",
          fillParent && FLAG_FILL_CLASS,
          className
        )}
        style={fillParent ? style : { width, height, ...style }}
        title={title ?? code}
        dangerouslySetInnerHTML={{ __html: fallbackSvg }}
      />
    )
  }

  return (
    <span
      className={cn(
        `inline-flex shrink-0 items-center justify-center overflow-hidden ${flagRadiusClass} bg-muted text-[10px] font-medium text-muted-foreground`,
        fillParent && FLAG_FILL_CLASS,
        className
      )}
      style={fillParent ? style : { width, height, ...style }}
      title={title ?? code}
    >
      {code.slice(0, 2)}
    </span>
  )
}
