import { isSensitiveAppUpdateRoute } from '../appUpdates'
import { isNativeVersionBelowMin, isValidMinNativeVersion, parseAppVersionParts } from '../appVersion'

describe('isSensitiveAppUpdateRoute', () => {
  it('blocks reload on PIN, send confirm, and checkout routes', () => {
    expect(isSensitiveAppUpdateRoute('SendConfirm')).toBe(true)
    expect(isSensitiveAppUpdateRoute('SendPin')).toBe(true)
    expect(isSensitiveAppUpdateRoute('PinEntryGate')).toBe(true)
    expect(isSensitiveAppUpdateRoute('MfaVerify')).toBe(true)
    expect(isSensitiveAppUpdateRoute('ExpressDepositReview')).toBe(true)
  })

  it('allows reload on idle home surfaces', () => {
    expect(isSensitiveAppUpdateRoute('Dashboard')).toBe(false)
    expect(isSensitiveAppUpdateRoute('More')).toBe(false)
    expect(isSensitiveAppUpdateRoute('')).toBe(false)
    expect(isSensitiveAppUpdateRoute(undefined)).toBe(false)
  })
})

describe('appVersion', () => {
  it('parses two and three segment versions', () => {
    expect(parseAppVersionParts('1.10')).toEqual([1, 10, 0])
    expect(parseAppVersionParts('1.10.2')).toEqual([1, 10, 2])
  })

  it('rejects empty or garbage versions (fail open)', () => {
    expect(parseAppVersionParts('')).toBeNull()
    expect(parseAppVersionParts('latest')).toBeNull()
    expect(parseAppVersionParts('1')).toBeNull()
    expect(isValidMinNativeVersion('')).toBe(true)
    expect(isValidMinNativeVersion('1.10.2')).toBe(true)
    expect(isValidMinNativeVersion('nope')).toBe(false)
  })

  it('compares native vs minimum without blocking on missing values', () => {
    expect(isNativeVersionBelowMin('1.10.1', '1.10.2')).toBe(true)
    expect(isNativeVersionBelowMin('1.10.2', '1.10.2')).toBe(false)
    expect(isNativeVersionBelowMin('1.11.0', '1.10.2')).toBe(false)
    expect(isNativeVersionBelowMin('1.10.2', '')).toBe(false)
    expect(isNativeVersionBelowMin(undefined, '1.10.2')).toBe(false)
    expect(isNativeVersionBelowMin('1.10.2', 'bad')).toBe(false)
  })
})
