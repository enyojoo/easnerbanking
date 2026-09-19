import { joinApiPath } from "@easner/shared"

/** 308 leftover `/api/*` on a UI host to the API origin. Null if that would loop. */
export function leftoverApiRedirectUrl(
  requestUrl: string,
  path: string[] | undefined,
): URL | null {
  const suffix = (path || []).join("/")
  const dest = new URL(joinApiPath(suffix ? `/api/${suffix}` : "/api"))
  dest.search = new URL(requestUrl).search
  if (dest.origin === new URL(requestUrl).origin) return null
  return dest
}
