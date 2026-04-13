import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

/** Origins allowed to call the business API from a browser (e.g. Easner Office on another host/port). */
function parseAllowedOrigins(): Set<string> {
  const fromList =
    process.env.CORS_ALLOWED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  const single = process.env.EASNER_OFFICE_ORIGIN?.trim()
  const fromEnv = single ? [...fromList, single] : fromList
  /** Local Office dev + production Easner Office on Vercel (pair with easnerbank.vercel.app). */
  const defaults = [
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "https://easnerbanking-office.vercel.app",
  ]
  return new Set([...defaults, ...fromEnv])
}

export function isCorsAllowedOrigin(origin: string | null, allowed: Set<string>): boolean {
  if (!origin) return false
  return allowed.has(origin)
}

export function getCorsAllowedOrigins(): Set<string> {
  return parseAllowedOrigins()
}

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const

export function corsPreflightResponse(request: NextRequest, allowed: Set<string>): NextResponse | null {
  if (request.method !== "OPTIONS") return null
  const origin = request.headers.get("origin")
  if (!isCorsAllowedOrigin(origin, allowed)) {
    return new NextResponse(null, { status: 403 })
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Allow-Origin": origin!,
      Vary: "Origin",
    },
  })
}

export function applyCorsHeaders(
  response: NextResponse,
  request: NextRequest,
  allowed: Set<string>
): NextResponse {
  const origin = request.headers.get("origin")
  if (origin && isCorsAllowedOrigin(origin, allowed)) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Vary", "Origin")
  }
  return response
}
