import { APP_URLS } from "@easner/shared"

/**
 * Public origin for links shown to operators (counter URL, metadataBase).
 * Env override is optional — production default is business.easner.com.
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
  return APP_URLS.business
}
