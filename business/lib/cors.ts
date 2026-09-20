import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getInvoiceAppPublicOrigin, getPayAppPublicOrigin } from "@/lib/customer-hosts"

/** Origins allowed to call the business API from a browser (e.g. Easner Office on another host/port). */
function parseAllowedOrigins(): Set<string> {
  const fromList =
    process.env.CORS_ALLOWED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  /** Optional extra Office origin. Production `https://bk.easner.com` is already in defaults. */
  const single = process.env.EASNER_OFFICE_ORIGIN?.trim()
  const fromEnv = single ? [...fromList, single] : fromList
  /** Local UI ports: business 3000, office 3001. API is 3002 (not a browser origin). */
  const defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "https://easnerbanking-office.vercel.app",
    /** Expo web consumer app (browser calls api.easner.com with Bearer + account scope header). */
    "https://app.easner.com",
    "https://easner-web.vercel.app",
    /** Business + Platform dashboards (Bearer, credentials omit). */
    "https://business.easner.com",
    "https://platform.easner.com",
    /** Payer hosts stay on the business UI project and call api.easner.com after the split. */
    "https://pay.easner.com",
    "https://invoice.easner.com",
    getPayAppPublicOrigin(),
    getInvoiceAppPublicOrigin(),
    /** Easner Office production. */
    "https://bk.easner.com",
    /** Marketing site – app download popup email capture. */
    "https://www.easner.com",
    "https://easner.com",
    /** New business UI project production alias. */
    "https://easnerbank.vercel.app",
  ]
  return new Set([...defaults, ...fromEnv])
}

/**
 * Business UI Vercel hosts: production alias `easnerbank.vercel.app`, plus unique
 * / preview hosts from that project or `easner-business` (`*-easner.vercel.app`).
 */
function isBusinessVercelOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    if (url.protocol !== "https:") return false
    return /^(easnerbank|easner-business)(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(url.hostname)
  } catch {
    return false
  }
}

function isOfficeVercelOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    if (url.protocol !== "https:") return false
    return /^easnerbanking-office(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(url.hostname)
  } catch {
    return false
  }
}

export function isCorsAllowedOrigin(origin: string | null, allowed: Set<string>): boolean {
  if (!origin) return false
  return allowed.has(origin) || isBusinessVercelOrigin(origin) || isOfficeVercelOrigin(origin)
}

export function getCorsAllowedOrigins(): Set<string> {
  return parseAllowedOrigins()
}

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Easner-Account-Scope, X-Easner-Noah-Scope, Idempotency-Key",
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
