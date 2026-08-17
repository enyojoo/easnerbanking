jest.mock('../src/lib/expoGo', () => ({
  isExpoGo: false,
}))

jest.mock('@easner/shared', () => ({
  APP_URLS: { app: 'https://app.easner.com' },
}))

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'easner://auth/callback'),
}))

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

import { getOAuthRedirectUri } from '../src/lib/oauthRedirect'

describe('getOAuthRedirectUri', () => {
  it('uses HTTPS universal link on native store builds', () => {
    expect(getOAuthRedirectUri()).toBe('https://app.easner.com/auth/callback')
  })
})
