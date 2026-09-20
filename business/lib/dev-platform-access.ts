import {
  getProductSwitchUrl,
  isBankingOnlyPath,
  isPlatformOnlyPath,
  type ProductSurface,
} from "@/lib/app-surface"

export type DevPlatformAccessDecision =
  | { action: "allow" }
  | { action: "need-account" }
  | { action: "redirect"; href: string }

/** `null` until the profile has actually returned the Office flag — not the default. */
export function readDevPlatformFlag(
  hasData: boolean,
  devPlatformEnabled: boolean | undefined,
): boolean | null {
  if (!hasData || devPlatformEnabled == null) return null
  return devPlatformEnabled
}

export function resolveDevPlatformAccess(input: {
  surface: ProductSurface
  pathname: string
  hasData: boolean
  enabled: boolean | null
  split: boolean
}): DevPlatformAccessDecision {
  const { surface, pathname, hasData, enabled, split } = input

  if (surface === "platform" && hasData && enabled === false) {
    return { action: "need-account" }
  }

  if (surface === "business" && isPlatformOnlyPath(pathname)) {
    if (hasData && enabled === false) return { action: "need-account" }
    if (hasData && enabled === true && split) {
      return { action: "redirect", href: getProductSwitchUrl("platform", pathname) }
    }
  }

  if (surface === "platform" && isBankingOnlyPath(pathname) && split) {
    return { action: "redirect", href: getProductSwitchUrl("business", pathname) }
  }

  if (
    surface === "platform" &&
    (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) &&
    split
  ) {
    return { action: "redirect", href: getProductSwitchUrl("platform", "/console") }
  }

  return { action: "allow" }
}
