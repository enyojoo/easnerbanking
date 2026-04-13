import Image from "next/image"
import { BRAND } from "./brand-constants"

interface BrandLogoProps {
  href?: string
  className?: string
  size?: "sm" | "md" | "lg"
}

export function BrandLogo({ href, className = "", size = "md" }: BrandLogoProps) {
  const sizeClasses = {
    sm: "h-4",
    md: "h-6",
    lg: "h-7",
  }

  const img = (
    <Image
      src={BRAND.logo}
      alt={`${BRAND.name} Logo`}
      width={160}
      height={40}
      unoptimized
      className={`h-auto w-auto object-contain ${sizeClasses[size]} ${className}`}
    />
  )

  if (href) {
    return <a href={href}>{img}</a>
  }

  return img
}
