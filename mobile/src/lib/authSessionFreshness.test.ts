import { describe, expect, it } from 'vitest'
import { ACCESS_TOKEN_EXPIRY_MARGIN_MS, isAccessTokenFresh } from './authSessionFreshness'

describe('isAccessTokenFresh', () => {
  const now = 1_700_000_000_000

  it('rejects missing tokens', () => {
    expect(isAccessTokenFresh(null, now)).toBe(false)
    expect(isAccessTokenFresh({ access_token: '', expires_at: now / 1000 + 3600 }, now)).toBe(false)
  })

  it('rejects tokens within the expiry margin', () => {
    const expiresAt = Math.floor((now + ACCESS_TOKEN_EXPIRY_MARGIN_MS) / 1000)
    expect(isAccessTokenFresh({ access_token: 'tok', expires_at: expiresAt }, now)).toBe(false)
  })

  it('accepts tokens with more than the margin remaining', () => {
    const expiresAt = Math.floor((now + ACCESS_TOKEN_EXPIRY_MARGIN_MS + 5_000) / 1000)
    expect(isAccessTokenFresh({ access_token: 'tok', expires_at: expiresAt }, now)).toBe(true)
  })
})
