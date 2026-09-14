export const EMAIL_PROVIDER_SETTING_KEY = "email_provider"

export type EmailProvider = "ses" | "sendgrid"

export const DEFAULT_EMAIL_PROVIDER: EmailProvider = "ses"

export function parseEmailProvider(value: unknown, fallback: EmailProvider = DEFAULT_EMAIL_PROVIDER): EmailProvider {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (normalized === "ses" || normalized === "sendgrid") return normalized
  return fallback
}

export function readEmailProviderEnvOverride(): EmailProvider | null {
  const raw = process.env.EMAIL_PROVIDER?.trim()
  if (!raw) return null
  return parseEmailProvider(raw, DEFAULT_EMAIL_PROVIDER)
}

export function isSesCredentialsConfigured(): boolean {
  return Boolean(process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim())
}

export function isSendGridCredentialsConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY?.trim())
}

export function isEmailProviderCredentialsConfigured(provider: EmailProvider): boolean {
  return provider === "ses" ? isSesCredentialsConfigured() : isSendGridCredentialsConfigured()
}

export function resolveSesRegion(): string {
  return process.env.SES_REGION?.trim() || process.env.AWS_REGION?.trim() || "eu-west-2"
}
