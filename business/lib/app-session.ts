import jwt from "jsonwebtoken"
import type { User } from "@supabase/supabase-js"

export { BUSINESS_APP_SESSION_COOKIE } from "@/lib/app-session-constants"
const BUSINESS_APP_SESSION_TTL_SECONDS = 60 * 60

type BusinessAppSessionClaims = {
  sub: string
  email?: string | null
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  type: "business-app-session"
  iat?: number
  exp?: number
}

function getSessionSecret(): string {
  const secret = process.env.BUSINESS_APP_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error("BUSINESS_APP_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY is required")
  }
  return secret
}

export function createBusinessAppSession(user: Pick<User, "id" | "email" | "user_metadata">): {
  token: string
  expiresIn: number
} {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email ?? null,
      name: typeof meta.name === "string" ? meta.name : null,
      first_name: typeof meta.first_name === "string" ? meta.first_name : null,
      last_name: typeof meta.last_name === "string" ? meta.last_name : null,
      type: "business-app-session",
    } satisfies BusinessAppSessionClaims,
    getSessionSecret(),
    {
      algorithm: "HS256",
      expiresIn: BUSINESS_APP_SESSION_TTL_SECONDS,
    },
  )

  return { token, expiresIn: BUSINESS_APP_SESSION_TTL_SECONDS }
}

export function getBusinessAppSessionUser(token: string): User | null {
  try {
    const decoded = jwt.verify(token, getSessionSecret(), { algorithms: ["HS256"] }) as BusinessAppSessionClaims
    if (decoded.type !== "business-app-session" || !decoded.sub) return null
    return {
      id: decoded.sub,
      email: decoded.email ?? null,
      user_metadata: {
        ...(decoded.name ? { name: decoded.name } : {}),
        ...(decoded.first_name ? { first_name: decoded.first_name } : {}),
        ...(decoded.last_name ? { last_name: decoded.last_name } : {}),
      },
    } as User
  } catch {
    return null
  }
}
