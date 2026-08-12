import Image from "next/image"
import { BRAND } from "./brand-constants"

interface BrandLogoProps {
  href?: string
  className?: string
  size?: "sm" | "md" | "lg"
  priority?: boolean
}

const sizePx = {
  sm: { width: 80, height: 16 },
  md: { width: 120, height: 24 },
  lg: { width: 140, height: 28 },
} as const

export function BrandLogo({
  href,
  className = "",
  size = "md",
  priority = false,
}: BrandLogoProps) {
  const { width, height } = sizePx[size]

  const img = (
    <Image
      src={BRAND.logo}
      alt={`${BRAND.name} Logo`}
      width={width}
      height={height}
      priority={priority}
      className={`w-auto object-contain ${className}`}
      style={{ height: size === "sm" ? 16 : size === "md" ? 24 : 28, width: "auto" }}
    />
  )

  if (href) {
    return <a href={href}>{img}</a>
  }

  return img
}
