/**
 * Email design tokens – mirrors docs/marketing/design-system.md §2.0 / §8.1
 */
import { easnerBrand } from "../../shared/src/design/tokens"

export const emailTheme = {
  graphite: easnerBrand.graphite,
  ink: easnerBrand.ink,
  ivory: easnerBrand.ivory,
  cloud: easnerBrand.cloud,
  mist: easnerBrand.mist,
  slate: easnerBrand.slate,
  bodyText: "#3D403D",
  primary: easnerBrand.primary,
  primaryHover: easnerBrand.primaryHover,
  darkAccent: easnerBrand.darkAccent,
  darkPrimaryHover: easnerBrand.darkPrimaryHover,
  emerald: easnerBrand.emerald,
  emeraldDeep: easnerBrand.emeraldDeep,
  statusBadges: {
    pending: { bg: "#FAF1DB", fg: "#8A6221" },
    processing: { bg: "#EFECE2", fg: "#3D403D" },
    completed: { bg: "#E6F4EC", fg: "#0A6E4C" },
    failed: { bg: "#F4E5E5", fg: "#5F2424" },
    cancelled: { bg: "#EFECE2", fg: "#6F756F" },
  },
} as const

export const EASNER_BRAND_CDN =
  "https://seeqjiebmrnolcyydewj.supabase.co/storage/v1/object/public/brand"

/** Dark wordmark for light backgrounds (default). */
export const EASNER_LOGO_URL_LIGHT = `${EASNER_BRAND_CDN}/Easner%20Logo.png`

/** Light wordmark for dark backgrounds (`prefers-color-scheme: dark`). */
export const EASNER_LOGO_URL_DARK =
  "https://kixymrjsupzkxokujmwu.supabase.co/storage/v1/object/public/brand/Easner%20LogoW.png"

/** @deprecated Use EASNER_LOGO_URL_LIGHT */
export const EASNER_LOGO_URL = EASNER_LOGO_URL_LIGHT

export const EASNER_COMPANY_LEGAL_NAME = "Easner Group, Inc."

/** Public contact / sales page – used for email “Contact Support” links. */
export const EASNER_CONTACT_URL = "https://www.easner.com/contact"

export const EASNER_COMPANY_ADDRESS_HTML =
  "584 Castro St, Suite 4092<br>San Francisco, CA 94114, United States"

export const EASNER_COMPANY_ADDRESS =
  "584 Castro St, Suite 4092, San Francisco, CA 94114, United States"

export const EASNER_EMAIL_ACCOUNT_NOTICE =
  "You received this email because you have an Easner account."

export const EASNER_EMAIL_NO_ACCOUNT_NOTICE =
  "You received this email because you're creating an Easner account."

export function resolveEmailFooterNotice(recipientHasEasnerAccount = true): string {
  return recipientHasEasnerAccount ? EASNER_EMAIL_ACCOUNT_NOTICE : EASNER_EMAIL_NO_ACCOUNT_NOTICE
}
