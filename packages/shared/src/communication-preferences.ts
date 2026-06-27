/**
 * Stored in `public.user_preferences.communication_preferences` (jsonb).
 * Business app and mobile share the same row keyed by `user_id`.
 * All categories and channels default to **on**; users opt out via Settings.
 */
export type CommunicationChannels = {
  email: boolean
  push: boolean
}

export type CommunicationPreferences = {
  productUpdates: boolean
  securityAlerts: boolean
  marketingEmails: boolean
  channels: CommunicationChannels
}

export const DEFAULT_COMMUNICATION_PREFERENCES: CommunicationPreferences = {
  productUpdates: true,
  securityAlerts: true,
  marketingEmails: true,
  channels: {
    email: true,
    push: true,
  },
}

/** Shown under communication toggles (business + mobile). */
export const COMMUNICATION_PREFERENCES_DISCLAIMER =
  "We may still send transactional messages about your account and activity, and required security or legal notices, even when some preferences are off."

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean"
}

/** Merge partial JSON from DB with defaults. */
export function parseCommunicationPreferences(raw: unknown): CommunicationPreferences {
  const d = DEFAULT_COMMUNICATION_PREFERENCES
  if (!raw || typeof raw !== "object") return { ...d, channels: { ...d.channels } }

  const o = raw as Record<string, unknown>
  const ch = o.channels && typeof o.channels === "object" ? (o.channels as Record<string, unknown>) : {}

  return {
    productUpdates: isBool(o.productUpdates) ? o.productUpdates : d.productUpdates,
    securityAlerts: isBool(o.securityAlerts) ? o.securityAlerts : d.securityAlerts,
    marketingEmails: isBool(o.marketingEmails) ? o.marketingEmails : d.marketingEmails,
    channels: {
      email: isBool(ch.email) ? ch.email : d.channels.email,
      push: isBool(ch.push) ? ch.push : d.channels.push,
    },
  }
}
