"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { NeedDeveloperAccountPage } from "@/components/need-developer-account"
import {
  getProductSwitchUrl,
  isBankingOnlyPath,
  isPlatformOnlyPath,
  isProductHostSplit,
} from "@/lib/app-surface"
import { useAppSurface } from "@/lib/use-app-surface"
import { useBusinessProfile } from "@/lib/use-business-profile"

function ProductRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.assign(href)
  }, [href])
  return <NeedDeveloperAccountPage />
}

/**
 * Office-gated Platform access + wrong-surface redirects after hosts split.
 * Same-origin (Phase 1b before platform.easner.com exists) keeps pages on this host.
 */
export function DevPlatformAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const surface = useAppSurface()
  const { devPlatformEnabled, hasData } = useBusinessProfile()
  const enabled = Boolean(devPlatformEnabled)
  const split = isProductHostSplit()

  if (surface === "platform" && hasData && !enabled) {
    return <NeedDeveloperAccountPage />
  }

  if (surface === "business" && isPlatformOnlyPath(pathname)) {
    if (hasData && !enabled) {
      return <NeedDeveloperAccountPage />
    }
    if (hasData && enabled && split) {
      return <ProductRedirect href={getProductSwitchUrl("platform", pathname)} />
    }
  }

  if (surface === "platform" && isBankingOnlyPath(pathname) && split) {
    return <ProductRedirect href={getProductSwitchUrl("business", pathname)} />
  }

  if (surface === "platform" && (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) && split) {
    return <ProductRedirect href={getProductSwitchUrl("platform", "/customers")} />
  }

  return <>{children}</>
}
