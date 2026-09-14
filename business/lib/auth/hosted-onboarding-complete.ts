export const HOSTED_ONBOARDING_COMPLETE_PATH = "/auth/onboarding-complete"

const LEGACY_COMPLETE_PATHS = new Set([
  "/auth/noah-complete",
  "/auth/grid-complete",
  "/auth/bridge-complete",
])

const PRODUCTION_BUSINESS_ORIGIN = "https://business.easner.com"

export type HostedOnboardingContext = "kyc" | "kyb" | "business" | "bridge-tos"

function tryHttpsWebOrigin(raw: string | undefined): string | null {
  const value = String(raw ?? "").trim()
  if (!value) return null
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`)
    if (url.protocol !== "https:") return null
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host === "127.0.0.1") return null
    if (host === "api.easner.com" || host.startsWith("api.") || host.startsWith("js.")) return null
    return url.origin
  } catch {
    return null
  }
}

/** HTTPS origin of the business web app. Never api/js hosts — Noah requires https ReturnURL. */
export function getHostedOnboardingOrigin(): string {
  return (
    tryHttpsWebOrigin(process.env.NEXT_PUBLIC_BUSINESS_APP_URL) ||
    tryHttpsWebOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    tryHttpsWebOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
    PRODUCTION_BUSINESS_ORIGIN
  )
}

export function isHostedOnboardingCompletePath(pathname: string | null | undefined): boolean {
  return String(pathname ?? "").replace(/\/$/, "") === HOSTED_ONBOARDING_COMPLETE_PATH
}

export function isHostedOnboardingCompleteUrl(href: string): boolean {
  try {
    const url = new URL(href, typeof window !== "undefined" ? window.location.origin : "http://localhost")
    return isHostedOnboardingCompletePath(url.pathname)
  } catch {
    return href.includes(HOSTED_ONBOARDING_COMPLETE_PATH)
  }
}

/** Shared ReturnURL for hosted KYC/KYB (Noah, Grid, Bridge). */
export function getHostedOnboardingReturnUrl(context: HostedOnboardingContext): string {
  return `${getHostedOnboardingOrigin()}${HOSTED_ONBOARDING_COMPLETE_PATH}?context=${context}`
}

/** Rewrite leftover provider-named env URLs onto the shared return path. */
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
