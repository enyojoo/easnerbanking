/** Map Supabase / GoTrue OTP errors to user-facing copy (never expose "token" jargon). */
export function mapOtpVerifyErrorMessage(raw: string | null | undefined): string {
  const message = (raw ?? "").trim()
  if (!message) return "This code has expired or is incorrect. Request a new code below."

  const lower = message.toLowerCase()
  if (
    lower.includes("expired") ||
    lower.includes("invalid") ||
    lower.includes("token") ||
    lower.includes("otp")
  ) {
    return "This code has expired or is incorrect. Request a new code below."
  }

  return message
}
