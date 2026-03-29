import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown"
  }
  return request.headers.get("x-real-ip") ?? "unknown"
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Browser calls from Easner Office (different origin) need CORS on API responses.
  if (pathname.startsWith("/api/")) {
    const allowed = getCorsAllowedOrigins()
    const preflight = corsPreflightResponse(request, allowed)
    if (preflight) return preflight
  }

  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options as CookieOptions)
            }
          } catch {
            // ignore when cookies cannot be written
          }
        },
      },
    })
    await supabase.auth.getUser()
  }

  if (pathname.startsWith("/api/")) {
    const allowed = getCorsAllowedOrigins()
    return applyCorsHeaders(response, request, allowed)
  }

  // Set business owner IP when they visit the invoices section
  if (pathname.startsWith("/invoices")) {
    const ip = getClientIp(request)
    response.cookies.set("easner_business_owner_ip", ip, {
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
      sameSite: "lax",
    })
  }

  return response
}

export const config = {
  matcher: [
    // Supabase session refresh on navigations + API; exclude static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
