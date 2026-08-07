const SIGNUP_BLOCKED_MESSAGE_KEY = "easner_signup_blocked_message"

export function stashSignupBlockedMessage(message: string): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(SIGNUP_BLOCKED_MESSAGE_KEY, message)
  } catch {
    // ignore
  }
}

export function consumeSignupBlockedMessage(): string | null {
  if (typeof window === "undefined") return null
  try {
    const message = sessionStorage.getItem(SIGNUP_BLOCKED_MESSAGE_KEY)
    if (message) sessionStorage.removeItem(SIGNUP_BLOCKED_MESSAGE_KEY)
    return message
  } catch {
    return null
  }
}

export function isSignupEmailBlockCode(code: string | null | undefined): boolean {
  return code === "DISPOSABLE_EMAIL" || code === "APPLE_PRIVATE_RELAY_EMAIL"
}
