/**
 * Cross-platform app PIN parameters (business Web Crypto + mobile PBKDF2).
 * PIN string: exactly 4 digits; UTF-8 encoded for KDF input.
 */
export const LOGIN_PIN_PBKDF2_ITERATIONS = 100_000
export const LOGIN_PIN_SALT_BYTES = 16
export const LOGIN_PIN_DERIVED_KEY_BITS = 256
export const LOGIN_PIN_MAX_FAILED_ATTEMPTS = 5
export const LOGIN_PIN_LOCKOUT_MS = 15 * 60 * 1000
/** Strict: /^\\d{4}$/ */
export const LOGIN_PIN_REGEX = /^\d{4}$/
