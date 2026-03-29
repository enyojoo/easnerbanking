import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient, type User } from "@supabase/supabase-js"

export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Noah API routes")
  }
  return createClient(url, key)
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
 * Resolves the user for Route Handlers. Prefer **`Authorization: Bearer`** (business app
 * uses localStorage + `fetchWithSession` with `credentials: "omit"` to avoid oversized
 * `Cookie` headers on Vercel). Falls back to Supabase cookies (SSR / cross-origin flows).
 */
export async function getUserFromApiRequest(request: Request): Promise<User | null> {
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
          setAll(cookiesToSet) {
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
