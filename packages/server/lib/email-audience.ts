/**
 * Business vs Personal email audience profiles (NAMING.md)
 */
import {
  personalMobileDashboardUrl,
  personalMobileNotificationsUrl,
  resolvePersonalMobileAppOrigin,
} from "@easner/shared/mobile-personal-links"
import {
  resolveBusinessFromName,
  resolveEmailReplyTo,
  resolvePersonalFromName,
} from "./email-from"

export type EmailAudience = "business" | "personal"

export type EmailAudienceProfile = {
  audience: EmailAudience
  productName: string
  fromName: string
  dashboardUrl: string
  supportEmail: string
  /** Shown in footer for non-transactional mail */
  preferencesUrl: string
  /** Optional founder signature block (welcome emails) */
  signatureHtml?: string
  signatureText?: string
}

const BUSINESS_BASE =
  process.env.NEXT_PUBLIC_BUSINESS_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://business.easner.com"

const PERSONAL_MOBILE_ORIGIN = resolvePersonalMobileAppOrigin(
  process.env.NEXT_PUBLIC_MOBILE_APP_URL,
)

const FOUNDER_SIGNATURE_HTML = `<p style="margin: 24px 0 0 0; color: #3D403D; font-size: 15px; line-height: 1.7;">
        Best regards,<br><br>
        <strong>Enyo Sam</strong><br>
        Founder, Easner
      </p>`

const FOUNDER_SIGNATURE_TEXT = "\n\nBest regards,\n\nEnyo Sam\nFounder, Easner"

export function getEmailAudienceProfile(audience: EmailAudience): EmailAudienceProfile {
  if (audience === "business") {
    return {
      audience: "business",
      productName: "Easner Business Banking",
      fromName: resolveBusinessFromName(),
      dashboardUrl: `${BUSINESS_BASE}/dashboard`,
      supportEmail: resolveEmailReplyTo(),
      preferencesUrl: `${BUSINESS_BASE}/settings/communication`,
      signatureHtml: FOUNDER_SIGNATURE_HTML,
      signatureText: FOUNDER_SIGNATURE_TEXT,
    }
  }

  return {
    audience: "personal",
    productName: "Easner Banking",
    fromName: resolvePersonalFromName(),
    dashboardUrl: personalMobileDashboardUrl(PERSONAL_MOBILE_ORIGIN),
    supportEmail: resolveEmailReplyTo(),
    preferencesUrl: personalMobileNotificationsUrl(PERSONAL_MOBILE_ORIGIN),
    signatureHtml: FOUNDER_SIGNATURE_HTML,
    signatureText: FOUNDER_SIGNATURE_TEXT,
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
