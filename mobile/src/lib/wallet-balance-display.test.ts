import { describe, expect, it } from 'vitest'
import {
  isDefinitiveEmptyBalanceResponse,
  isSuspiciousAuthoritativeZeroRegression,
} from './wallet-balance-display'

describe('isDefinitiveEmptyBalanceResponse', () => {
  it('treats no_wallet_owner as definitive zero', () => {
    expect(isDefinitiveEmptyBalanceResponse('none', 'no_wallet_owner')).toBe(true)
  })

  it('rejects transient Turnkey failures', () => {
    expect(isDefinitiveEmptyBalanceResponse('none', 'turnkey_balance_query_failed')).toBe(false)
    expect(
      isDefinitiveEmptyBalanceResponse('none', 'turnkey_balance_query_failed:Resource exhausted'),
    ).toBe(false)
  })

  it('accepts turnkey and db sources only via authoritative path', () => {
    expect(isDefinitiveEmptyBalanceResponse('turnkey', undefined)).toBe(false)
    expect(isDefinitiveEmptyBalanceResponse('db', 'wallet_balances_snapshot')).toBe(false)
  })
})

describe('isSuspiciousAuthoritativeZeroRegression', () => {
  it('flags db zero regression when prior snapshot was non-zero', () => {
    expect(
      isSuspiciousAuthoritativeZeroRegression('db', '0', '0', { USD: '12.50', EUR: '0' }),
    ).toBe(true)
  })

  it('allows authoritative zero for new users with no prior balance', () => {
    expect(isSuspiciousAuthoritativeZeroRegression('db', '0', '0', { USD: '', EUR: '' })).toBe(
      false,
    )
    expect(isSuspiciousAuthoritativeZeroRegression('db', '0', '0', null)).toBe(false)
  })

  it('allows partial zero when the other currency stays non-zero', () => {
    expect(
      isSuspiciousAuthoritativeZeroRegression('db', '0', '5.00', { USD: '10.00', EUR: '0' }),
    ).toBe(false)
  })
})
