import Link from "next/link"
import Image from "next/image"
import { BRAND } from "./brand-constants"

interface BusinessLogoProps {
  /** Size variant */
  size?: "sm" | "md" | "lg"
  /** Link href - if provided, wraps in Link */
  href?: string
  className?: string
  /** LCP candidate on auth / shell entry */
  priority?: boolean
}

const sizePx = {
  sm: { width: 96, height: 16 },
  md: { width: 144, height: 24 },
  lg: { width: 168, height: 28 },
} as const

export function BusinessLogo({
  size = "md",
  href = "/",
  className = "",
  priority = false,
}: BusinessLogoProps) {
  const { width, height } = sizePx[size]

  const img = (
    <>
      <Image
        src={BRAND.logoBusinessLight}
        alt="Easner Business"
        width={width}
        height={height}
        priority={priority}
        className={`w-auto object-contain dark:hidden ${className}`}
        style={{ height: size === "sm" ? 16 : size === "md" ? 24 : 28, width: "auto" }}
      />
      <Image
        src={BRAND.logoBusinessDark}
        alt="Easner Business"
        width={width}
        height={height}
        priority={priority}
        className={`hidden w-auto object-contain dark:block ${className}`}
        style={{ height: size === "sm" ? 16 : size === "md" ? 24 : 28, width: "auto" }}
      />
    </>
  )

  if (href) {
    const isExternal = href.startsWith("http")
    return (
      <Link
        href={href}
        className="inline-flex items-center"
        {...(isExternal && {
          target: "_blank",
          rel: "noopener noreferrer",
        })}
      >
        {img}
      </Link>
    )
  }

  return img
}
