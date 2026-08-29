/** Refresh when the access token has this little lifetime left. */
export const ACCESS_TOKEN_EXPIRY_MARGIN_MS = 60_000

export type AccessTokenExpirySource = {
  access_token?: string | null
  expires_at?: number | null
}

function sessionExpiresAtMs(session: AccessTokenExpirySource): number {
  const expiresAt = session.expires_at
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > 0) {
    return expiresAt * 1000
  }
  return 0
}

export function isAccessTokenFresh(
  session: AccessTokenExpirySource | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!session?.access_token) return false
  return sessionExpiresAtMs(session) - nowMs > ACCESS_TOKEN_EXPIRY_MARGIN_MS
}
