export const GOOGLE_SIGN_IN_CANCELLED_MESSAGE = 'Google sign-in was cancelled.'

export const GOOGLE_OAUTH_INCOMPLETE_MESSAGE =
  'Google sign-in did not finish. Try again, or sign up with email.'

/** Map Supabase / provider OAuth callback errors to user-facing copy. */
export function mapOAuthCallbackErrorMessage(
  error: string | null,
  errorDescription: string | null,
): string {
  if (error === 'access_denied') {
    return GOOGLE_SIGN_IN_CANCELLED_MESSAGE
  }

  const desc = (errorDescription ?? '').trim()

  if (/authorization attempt failed/i.test(desc)) {
    return 'Google could not complete sign-in. Try again, use a different Google account, or sign up with email.'
  }

  if (error === 'disallowed_useragent' || /disallowed_useragent/i.test(desc)) {
    return 'Google sign-in is not available in this browser. Try again or sign up with email.'
  }

  if (desc) return desc

  return 'Sign-in failed. Please try again.'
}

export function isGoogleSignInCancelledMessage(message: string): boolean {
  return message === GOOGLE_SIGN_IN_CANCELLED_MESSAGE
}
