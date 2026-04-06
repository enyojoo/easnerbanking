/**
 * Public origin for links shown to operators (counter URL, etc.).
 */
export function getBusinessAppPublicOrigin(): string {
  const env =
    process.env.NEXT_PUBLIC_BUSINESS_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    ""
  if (env) {
    try {
      return new URL(env).origin
    } catch {
      return env.replace(/\/$/, "")
    }
  }
  return ""
}
