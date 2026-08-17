import {
  GOOGLE_OAUTH_INCOMPLETE_MESSAGE,
  GOOGLE_SIGN_IN_CANCELLED_MESSAGE,
  isGoogleSignInCancelledMessage,
  mapOAuthCallbackErrorMessage,
} from '../src/lib/oauthCallbackError'

describe('mapOAuthCallbackErrorMessage', () => {
  it('maps access_denied to cancelled copy', () => {
    expect(mapOAuthCallbackErrorMessage('access_denied', null)).toBe(
      GOOGLE_SIGN_IN_CANCELLED_MESSAGE,
    )
  })

  it('maps Google authorization failure copy', () => {
    expect(
      mapOAuthCallbackErrorMessage(
        'server_error',
        'The authorization attempt failed for an unknown reason.',
      ),
    ).toBe(
      'Google could not complete sign-in. Try again, use a different Google account, or sign up with email.',
    )
  })

  it('passes through other provider descriptions', () => {
    expect(mapOAuthCallbackErrorMessage('invalid_request', 'Bad redirect')).toBe('Bad redirect')
  })

  it('falls back when only error code is present', () => {
    expect(mapOAuthCallbackErrorMessage('server_error', null)).toBe('Sign-in failed. Please try again.')
  })
})

describe('isGoogleSignInCancelledMessage', () => {
  it('detects cancelled copy', () => {
    expect(isGoogleSignInCancelledMessage(GOOGLE_SIGN_IN_CANCELLED_MESSAGE)).toBe(true)
    expect(isGoogleSignInCancelledMessage(GOOGLE_OAUTH_INCOMPLETE_MESSAGE)).toBe(false)
  })
})
