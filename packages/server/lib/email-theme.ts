/**
 * Email design tokens — mirrors docs/marketing/design-system.md §2.0 / §8.1
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

export const EASNER_LOGO_URL =
  "https://seeqjiebmrnolcyydewj.supabase.co/storage/v1/object/public/brand/Easner%20Logo.png"

export const EASNER_COMPANY_ADDRESS = "28 Geary St Ste 650, San Francisco, CA 94108"
