const DEFAULT_BUSINESS_APP_ORIGIN = "https://business.easner.com"

/**
 * Public origin for links shown to operators (counter URL, etc.).
 * Falls back to production Business URL when env is unset (needed for metadataBase).
 */
export function getBusinessAppPublicOrigin(): string {
  const env =
    process.env.NEXT_PUBLIC_BUSINESS_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    ""
  if (env) {
    try {
      return new URL(env).origin
    } catch {
      return env.replace(/\/$/, "")
    }
  }
  return DEFAULT_BUSINESS_APP_ORIGIN
}
