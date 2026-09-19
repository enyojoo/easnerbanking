import { APP_URLS } from "../constants/urls"

const ATTRIBUTION_PARAM_RE =
  /^(utm_|__ph_id$|gclid$|fbclid$|msclkid$|ttclid$|li_fat_id$|ref$|mc_cid$|mc_eid$)/i

const AUTH_QUERY_PARAM_RE =
  /^(code|token_hash|error|error_description|access_token|refresh_token)$/i

/** Non-tracking params preserved when scrubbing auth or attribution query strings. */
const PRESERVED_QUERY_PARAM_RE = /^(next|message|tab|invite|token|type)$/i

export const EASNER_BUSINESS_MARKETING_BASE = APP_URLS.businessMarketing

export type EasnerBusinessMarketingCampaign =
  | "powered_by"
  | "payer_invoice"
  | "payer_payment_link"
  | "payer_checkout"
  | "checkout_embed"
  | "invoice_pdf"

export function isAttributionQueryParam(key: string): boolean {
  return ATTRIBUTION_PARAM_RE.test(key)
}

/** Drop tracking params from the URL bar; keeps app params like `next` and `message`. */
export function stripAttributionParamsFromUrl(url: URL): string {
  const kept = new URLSearchParams()
  url.searchParams.forEach((value, key) => {
    if (!isAttributionQueryParam(key)) kept.append(key, value)
  })
  const query = kept.toString()
  return query ? `${url.pathname}?${query}` : url.pathname
}

/** After PostHog init captures UTMs / `__ph_id`, remove them from the visible URL. */
export function cleanBrowserAttributionUrl(): void {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  const cleaned = stripAttributionParamsFromUrl(url)
  const current = `${url.pathname}${url.search}`
  if (cleaned !== current) {
    window.history.replaceState({}, "", cleaned)
  }
}

/**
 * Outbound links to easner.com/business (Powered by, PDF footer, checkout embed).
 * Marketing can forward `__ph_id` + UTMs to business.easner.com signup CTAs.
 */
export function buildEasnerBusinessMarketingUrl(options?: {
  campaign?: EasnerBusinessMarketingCampaign | string
  source?: string
  medium?: string
  distinctId?: string | null
}): string {
  const url = new URL(EASNER_BUSINESS_MARKETING_BASE)
  url.searchParams.set("utm_source", options?.source ?? "easner_product")
  url.searchParams.set("utm_medium", options?.medium ?? "referral")
  url.searchParams.set("utm_campaign", options?.campaign ?? "powered_by")
  const id = String(options?.distinctId ?? "").trim()
  if (id) url.searchParams.set("__ph_id", id)
  return url.toString()
}

/** Strip OAuth/email verification params and tracking params; keep safe app params. */
export function pathnameAfterAuthCallback(url: URL): string {
  const kept = new URLSearchParams()
  url.searchParams.forEach((value, key) => {
    if (AUTH_QUERY_PARAM_RE.test(key)) return
    if (isAttributionQueryParam(key)) return
    if (PRESERVED_QUERY_PARAM_RE.test(key)) kept.append(key, value)
  })
  const query = kept.toString()
  return query ? `${url.pathname}?${query}` : url.pathname
}

export function referringDomain(referrer: string): string {
  if (!referrer) return "$direct"
  try {
    return new URL(referrer).hostname || "$direct"
  } catch {
    return "$direct"
  }
}

export function pageviewProperties(
  href: string,
  referrer: string,
): {
  $current_url: string
  $referrer: string
  $referring_domain: string
} {
  return {
    $current_url: href,
    $referrer: referrer || "$direct",
    $referring_domain: referringDomain(referrer),
  }
}

/**
 * @deprecated Prefer `pathnameAfterAuthCallback` — tracking params are persisted by PostHog
 * before the URL is cleaned; no need to keep them visible after auth redirects.
 */
export function pathnameWithAttributionParams(url: URL): string {
  return pathnameAfterAuthCallback(url)
}

export function shouldIdentifyCrossDomainId(
  crossDomainId: string | null | undefined,
  existingUserId: unknown,
): boolean {
  return Boolean(crossDomainId) && !existingUserId
}

export function isFreshAuthUser(
  createdAt: string | undefined,
  now = Date.now(),
  windowMs = 2 * 60 * 1000,
): boolean {
  if (!createdAt) return false
  const created = Date.parse(createdAt)
  return Number.isFinite(created) && now - created < windowMs
}

export function personPropertiesFromUser(
  user: {
    email?: string | null
    user_metadata?: Record<string, unknown> | null
  },
  extras?: { email?: string; name?: string },
): Record<string, unknown> {
  const meta = user.user_metadata ?? {}
  const metaName =
    typeof meta.name === "string"
      ? meta.name
      : [meta.first_name, meta.last_name].filter((value) => typeof value === "string").join(" ")
  const name = (extras?.name || metaName || "").toString().trim()
  const email = extras?.email || user.email || undefined
  return {
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
  }
}
