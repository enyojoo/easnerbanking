/**
 * Business vs Personal email audience profiles (NAMING.md)
 */
export type EmailAudience = "business" | "personal"

export type EmailAudienceProfile = {
  audience: EmailAudience
  productName: string
  fromName: string
  dashboardUrl: string
  supportEmail: string
  /** Shown in footer for non-transactional mail */
  preferencesUrl: string
  /** Optional founder signature block (business welcome) */
  signatureHtml?: string
  signatureText?: string
}

const BUSINESS_BASE =
  process.env.NEXT_PUBLIC_BUSINESS_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://business.easner.com"

const PERSONAL_BASE = process.env.NEXT_PUBLIC_APP_URL || "https://www.easner.com"

export function getEmailAudienceProfile(audience: EmailAudience): EmailAudienceProfile {
  if (audience === "business") {
    return {
      audience: "business",
      productName: "Easner Business Banking",
      fromName: process.env.SENDGRID_FROM_NAME_BUSINESS || "Easner Business",
      dashboardUrl: `${BUSINESS_BASE}/dashboard`,
      supportEmail: process.env.SENDGRID_REPLY_TO || "support@easner.com",
      preferencesUrl: `${BUSINESS_BASE}/settings/communication`,
      signatureHtml: `<p style="margin: 24px 0 0 0; color: #3D403D; font-size: 15px; line-height: 1.7;">
        Best regards,<br><br>
        <strong>Enyo Sam</strong><br>
        Founder, Easner
      </p>`,
      signatureText: "\n\nBest regards,\n\nEnyo Sam\nFounder, Easner",
    }
  }

  return {
    audience: "personal",
    productName: "Easner Personal Banking",
    fromName: process.env.SENDGRID_FROM_NAME || "Easner",
    dashboardUrl: `${PERSONAL_BASE}/dashboard`,
    supportEmail: process.env.SENDGRID_REPLY_TO || "support@easner.com",
    preferencesUrl: `${PERSONAL_BASE}/settings/communication`,
  }
}

/**
 * Resolve audience from explicit hint or WelcomeEmailData.audience field.
 * Server-side resolution via Supabase lives in business/lib/notifications/resolve-email-audience.ts
 */
export function resolveEmailAudienceFromData(data: {
  audience?: EmailAudience
}): EmailAudience {
  return data.audience === "business" ? "business" : "personal"
}
