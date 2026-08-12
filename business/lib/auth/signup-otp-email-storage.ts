const SIGNUP_OTP_EMAIL_KEY = "business-signup-otp-email"

export function stashSignupOtpEmail(email: string): void {
  if (typeof window === "undefined") return
  const trimmed = email.trim()
  if (!trimmed) return
  sessionStorage.setItem(SIGNUP_OTP_EMAIL_KEY, trimmed)
}

export function readSignupOtpEmail(): string | null {
  if (typeof window === "undefined") return null
  const raw = sessionStorage.getItem(SIGNUP_OTP_EMAIL_KEY)
  return raw?.trim() || null
}

export function clearSignupOtpEmail(): void {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(SIGNUP_OTP_EMAIL_KEY)
}
