/** Match business app `business/app/auth/signup/page.tsx` (no country on mobile). */
export const TERMS_URL = 'https://www.easner.com/terms?from=register'

/** Set by onboarding so `AuthScreen` opens on signup or login. Cleared after apply. */
export const AUTH_INITIAL_MODE_KEY = '@easner_auth_initial_mode'

/** Set after account deletion is scheduled; Auth shows closure notice on next visit. */
export const ACCOUNT_DELETED_FLAG_KEY = '@easner_account_deleted'

/** Set when sign-in cancels a pending account closure; Auth shows welcome-back toast. */
export const ACCOUNT_CLOSURE_CANCELLED_KEY = '@easner_account_closure_cancelled'
