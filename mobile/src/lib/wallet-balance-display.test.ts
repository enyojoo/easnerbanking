import { describe, expect, it } from 'vitest'
import { isDefinitiveEmptyBalanceResponse } from './wallet-balance-display'

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
