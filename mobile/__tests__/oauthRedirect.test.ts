jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'easner://auth/callback'),
}))

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

import { getOAuthRedirectUri } from '../src/lib/oauthRedirect'

describe('getOAuthRedirectUri', () => {
  it('uses the app deep link on native store builds', () => {
    expect(getOAuthRedirectUri()).toBe('easner://auth/callback')
  })
})
