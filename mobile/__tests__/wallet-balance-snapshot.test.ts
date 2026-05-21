jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiSet: jest.fn(),
}))

import {
  hasMeaningfulBalanceSnapshot,
  parseBalanceSnapshot,
} from '../src/lib/wallet-balance-snapshot'

describe('wallet-balance-snapshot', () => {
  it('parseBalanceSnapshot accepts stored USD/EUR', () => {
    const raw = JSON.stringify({ USD: '120.50', EUR: '0', ts: Date.now() })
    expect(parseBalanceSnapshot(raw)).toEqual({ USD: '120.50', EUR: '0' })
  })

  it('parseBalanceSnapshot rejects empty payload', () => {
    expect(parseBalanceSnapshot(JSON.stringify({ USD: '', EUR: '' }))).toBeNull()
  })

  it('hasMeaningfulBalanceSnapshot distinguishes unset vs stored zero', () => {
    expect(hasMeaningfulBalanceSnapshot({ USD: '0', EUR: '1.00' })).toBe(true)
    expect(hasMeaningfulBalanceSnapshot({ USD: '0', EUR: '0' })).toBe(true)
    expect(hasMeaningfulBalanceSnapshot({ USD: '', EUR: '' })).toBe(false)
  })
})
