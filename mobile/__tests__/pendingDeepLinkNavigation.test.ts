jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import {
  isUserDeepLinkUrl,
  parseDeepLinkFromUrl,
} from '../src/lib/pendingDeepLinkNavigation'

describe('isUserDeepLinkUrl', () => {
  it('accepts app.easner.com /user paths', () => {
    expect(isUserDeepLinkUrl('https://app.easner.com/user/dashboard')).toBe(true)
    expect(isUserDeepLinkUrl('https://app.easner.com/user/support')).toBe(true)
  })

  it('accepts legacy easner.com /user paths during migration', () => {
    expect(isUserDeepLinkUrl('https://easner.com/user/dashboard')).toBe(true)
  })

  it('rejects marketing and unrelated hosts', () => {
    expect(isUserDeepLinkUrl('https://www.easner.com/personal')).toBe(false)
    expect(isUserDeepLinkUrl('https://business.easner.com/dashboard')).toBe(false)
  })

  it('rejects OAuth callback URLs', () => {
    expect(isUserDeepLinkUrl('easner://auth/callback?code=abc')).toBe(false)
  })

  it('accepts easner:// user paths', () => {
    expect(isUserDeepLinkUrl('easner://user/dashboard')).toBe(true)
  })
})

describe('parseDeepLinkFromUrl', () => {
  it('maps app.easner.com dashboard to Dashboard screen', () => {
    expect(parseDeepLinkFromUrl('https://app.easner.com/user/dashboard')).toEqual(
      expect.objectContaining({ screen: 'Dashboard' }),
    )
  })

  it('maps transaction detail paths', () => {
    expect(parseDeepLinkFromUrl('https://app.easner.com/user/transactions/tx_123')).toEqual(
      expect.objectContaining({
        screen: 'TransactionDetails',
        params: { transactionId: 'tx_123', fromScreen: 'DeepLink' },
      }),
    )
  })
})
