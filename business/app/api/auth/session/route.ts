import { NextResponse } from "next/server"
import { getApiBaseUrl } from "@/lib/api-base-url"
import { BUSINESS_APP_SESSION_COOKIE } from "@/lib/app-session-constants"

/**
 * Same-origin session mint/clear for the business app.
 *
 * Proxies the Supabase access token to the API app's session mint
 * server-to-server (not subject to browser CORS), then sets the resulting
 * JWT as an httpOnly cookie on `business.easner.com` itself. The browser
 * never sees the token — `app-session-client.ts` only tracks the expiry.
 */

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}

export async function POST(request: Request) {
  let body: { accessToken?: string } = {}
  try {
    body = (await request.json()) as { accessToken?: string }
  } catch {
    body = {}
  }

  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : ""
  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token" }, { status: 400 })
  }

  const upstream = await fetch(`${getApiBaseUrl()}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
    cache: "no-store",
  })

  if (!upstream.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: upstream.status })
  }

  const session = (await upstream.json().catch(() => ({}))) as { token?: string; expiresIn?: number }
  if (!session.token || !session.expiresIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true, expiresIn: session.expiresIn })
  response.cookies.set(BUSINESS_APP_SESSION_COOKIE, session.token, cookieOptions(session.expiresIn))
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(BUSINESS_APP_SESSION_COOKIE, "", cookieOptions(0))
  return response
}
