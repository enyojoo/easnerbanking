import "server-only"
import { cookies } from "next/headers"
import type { BusinessScope } from "@easner/shared"
import { BUSINESS_APP_SESSION_COOKIE, getBusinessAppSessionUser } from "@/lib/app-session"

/**
 * Server-side scope resolver.
 *
 * Reads the short-lived `easner_business_session` cookie (minted by
 * `createBusinessAppSession` after login) to derive a `BusinessScope`
 * without making any network calls. Returns `null` when the user is
 * signed out or the cookie is invalid – server components should
 * gracefully skip prefetching in that case.
 */
export async function getServerScope(): Promise<BusinessScope | null> {
  const store = await cookies()
  const token = store.get(BUSINESS_APP_SESSION_COOKIE)?.value
  if (!token) return null
  const user = getBusinessAppSessionUser(token)
  if (!user?.id) return null
  // Until formal multi-entity lands, scope.orgId === scope.entityId === user.id.
  // This mirrors `BusinessScopeProvider` on the client so server and
  // client-produced cache keys line up exactly for hydration.
  return { kind: "business", orgId: user.id, entityId: user.id }
}
