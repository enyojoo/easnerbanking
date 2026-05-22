import { BRAND } from '@easner/shared'

/** Bundled mark — avoids remote fetch / expo-image URL issues after SDK upgrades. */
export const EASNER_MARK_SOURCE = require('../../assets/easner-mark.png')

/** Public Easner mark — kept for parity with web; prefer {@link EASNER_MARK_SOURCE} on native. */
export const EASNER_MARK_URL =
  'https://kixymrjsupzkxokujmwu.supabase.co/storage/v1/object/public/brand/Easner%20mark.png'

/** Bundled card-face icon (white-friendly mark on dark card gradient). */
export const EASNER_CARD_ICON_SOURCE = require('../../assets/icons/easner icon.png')

/**
 * Card face icon URL — business cards use `BRAND.icon` (`/easner-icon.png`, not always in repo).
 * Prefer {@link EASNER_CARD_ICON_SOURCE} on native.
 */
export const EASNER_CARD_ICON_URL = BRAND.favicon

export type PayeeAccountKind = 'business' | 'personal'
