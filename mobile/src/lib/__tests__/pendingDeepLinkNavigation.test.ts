jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}))
jest.mock('../payrollApprovalTokenStore', () => ({
  storePayrollApprovalToken: jest.fn(),
}))

import { isUserDeepLinkUrl, parseDeepLinkFromUrl } from '../pendingDeepLinkNavigation'

describe('Payroll connection links', () => {
  it('accepts the canonical HTTPS payroll URL', () => {
    const url = 'https://app.easner.com/payroll?token=opaque'
    expect(isUserDeepLinkUrl(url)).toBe(true)
    expect(parseDeepLinkFromUrl(url)?.screen).toBe('PayrollApproval')
  })

  it('accepts the native custom-scheme payroll URL', () => {
    expect(parseDeepLinkFromUrl('easner://payroll?token=opaque')?.screen).toBe('PayrollApproval')
  })

  it('does not treat authentication callbacks as payroll links', () => {
    expect(isUserDeepLinkUrl('easner://auth/callback?code=secret')).toBe(false)
  })
})
