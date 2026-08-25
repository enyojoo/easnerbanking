/**
 * Client-safe session constants. Kept separate from `app-session.ts`, which
 * imports `jsonwebtoken` — importing that module from client code drags
 * crypto-browserify (~98 KB gzip) into every page's bundle.
 */
export const BUSINESS_APP_SESSION_COOKIE = "easner_business_session"
