import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"

export const HOSTED_ONBOARDING_COMPLETE_PATH = "/auth/onboarding-complete"

const LEGACY_COMPLETE_PATHS = new Set([
  "/auth/noah-complete",
  "/auth/grid-complete",
  "/auth/bridge-complete",
])

export type HostedOnboardingContext = "kyc" | "kyb" | "business"

export function isHostedOnboardingCompletePath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? "").replace(/\/$/, "")
  return path === HOSTED_ONBOARDING_COMPLETE_PATH || LEGACY_COMPLETE_PATHS.has(path)
}

export function isHostedOnboardingCompleteUrl(href: string): boolean {
  try {
    const url = new URL(href, typeof window !== "undefined" ? window.location.origin : "http://localhost")
    return isHostedOnboardingCompletePath(url.pathname)
  } catch {
    return (
      href.includes(HOSTED_ONBOARDING_COMPLETE_PATH) ||
      href.includes("/auth/noah-complete") ||
      href.includes("/auth/grid-complete") ||
      href.includes("/auth/bridge-complete")
    )
  }
}

/** Shared ReturnURL for hosted KYC/KYB (Noah, Grid, Bridge). */
export function getHostedOnboardingReturnUrl(context: HostedOnboardingContext): string {
  return `${getBusinessAppPublicOrigin().replace(/\/+$/, "")}${HOSTED_ONBOARDING_COMPLETE_PATH}?context=${context}`
}

/** Map leftover provider-named complete paths onto the shared return URL. */
export function canonicalizeHostedOnboardingReturnUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/$/, "") || "/"
    if (LEGACY_COMPLETE_PATHS.has(path)) {
      parsed.pathname = HOSTED_ONBOARDING_COMPLETE_PATH
      return parsed.toString()
    }
  } catch {
    // ignore
  }
  return url
}
