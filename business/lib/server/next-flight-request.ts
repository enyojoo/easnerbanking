import "server-only"

/**
 * True when this request is an App Router *flight* fetch (client transition,
 * router prefetch, etc.) rather than a full HTML document navigation.
 *
 * Full document loads use a typical browser `Accept` list with `text/html`;
 * flight requests include `text/x-component` and/or Next router headers.
 * We skip blocking server prefetches on flight so in-app navigations stay
 * instant while hard refresh / deep links still dehydrate on the server.
 */
export function isNextjsAppRouterFlightRequest(h: Headers): boolean {
  const accept = h.get("accept") ?? ""
  if (accept.includes("text/x-component")) return true

  const rsc = h.get("rsc")
  if (rsc === "1") return true

  if (h.get("next-router-prefetch") === "1") return true

  if (h.get("next-router-state-tree") != null) return true

  return false
}
