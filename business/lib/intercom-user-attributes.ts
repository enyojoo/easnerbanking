import type { User } from "@supabase/supabase-js"

export function displayNameFromUser(user: User): string | undefined {
  const meta = user.user_metadata as Record<string, unknown> | undefined
  if (typeof meta?.name === "string") {
    const n = meta.name.trim()
    if (n) return n
  }
  const first = typeof meta?.first_name === "string" ? meta.first_name : ""
  const last = typeof meta?.last_name === "string" ? meta.last_name : ""
  const joined = [first, last].filter(Boolean).join(" ").trim()
  return joined || undefined
}

export function createdAtUnixSeconds(user: User): number | undefined {
  const c = user.created_at
  if (!c) return undefined
  const ms = Date.parse(c)
  if (Number.isNaN(ms)) return undefined
  return Math.floor(ms / 1000)
}

/**
 * Claims for Intercom Messenger Security (HS256 JWT). `user_id` is required by Intercom.
 * @see https://www.intercom.com/help/en/articles/10589769-authenticating-users-in-the-messenger-with-json-web-tokens-jwts
 */
export function intercomJwtPayloadFromUser(user: User) {
  const name = displayNameFromUser(user)
  const createdAt = createdAtUnixSeconds(user)
  return {
    user_id: user.id,
    email: user.email ?? undefined,
    ...(name ? { name } : {}),
    ...(createdAt !== undefined ? { created_at: createdAt } : {}),
  }
}
