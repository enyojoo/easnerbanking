import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient, type User } from "@supabase/supabase-js"
import { BUSINESS_APP_SESSION_COOKIE, getBusinessAppSessionUser } from "@/lib/app-session"

/**
 * NOTE: typed via call-site inference (not `ReturnType<typeof createClient>`,
 * which instantiates the generic params as `unknown` and collapses every
 * `.from(...)` row to `never`).
 */
function createSupabaseAdminUncached() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Noah API routes")
  }
  return createClient(url, key)
}

let adminClient: ReturnType<typeof createSupabaseAdminUncached> | null = null

/**
 * Memoized service-role client. The client is stateless (no per-request auth
 * — it always sends the service key), and several routes constructed it 3–4
 * times per request; each construction builds the full sub-client graph.
 */
export function createSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createSupabaseAdminUncached()
  }
  return adminClient
}

/** Bearer-only (e.g. cross-origin clients that do not send Easner session cookies). */
export async function getUserFromBearer(request: Request): Promise<User | null> {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  const token = auth.slice(7)
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

/**
 * Resolves the user for Route Handlers. Prefer the lightweight Easner app session cookie,
 * then Bearer for cross-origin callers, then Supabase SSR cookies as a final fallback.
 */
export async function getUserFromApiRequest(request: Request): Promise<User | null> {
  try {
    const cookieStore = await cookies()
    const appSession = cookieStore.get(BUSINESS_APP_SESSION_COOKIE)?.value
    if (appSession) {
      const user = getBusinessAppSessionUser(appSession)
      if (user) return user
    }
  } catch {
    // cookies() unavailable outside a request context
  }

  const bearerUser = await getUserFromBearer(request)
  if (bearerUser) return bearerUser

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (url && key) {
    try {
      const cookieStore = await cookies()
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            try {
              for (const { name, value, options } of cookiesToSet) {
                cookieStore.set(name, value, options as CookieOptions)
              }
            } catch {
              // ignore when cookies cannot be written
            }
          },
        },
      })
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()
      if (!error && user) return user
    } catch {
      // cookies() unavailable outside a request context
    }
  }
  return null
}
