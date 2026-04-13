import Image from "next/image"
import Link from "next/link"
import { BRAND } from "./brand-constants"

interface BusinessLogoProps {
  /** Size variant */
  size?: "sm" | "md" | "lg"
  /** Link href - if provided, wraps in Link */
  href?: string
  className?: string
}

const sizeClasses = {
  sm: "h-4",
  md: "h-6",
  lg: "h-7",
}

export function BusinessLogo({ size = "md", href = "/", className = "" }: BusinessLogoProps) {
  const img = (
    <Image
      src={BRAND.logoBusiness}
      alt="Easner Business"
      width={200}
      height={40}
      unoptimized
      className={`h-auto w-auto object-contain ${sizeClasses[size]} ${className}`}
    />
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
