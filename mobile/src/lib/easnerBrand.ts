import { BRAND } from '@easner/shared'

/** Bundled Easner mark — corner badge on Easetag / in-network recipient avatars. */
export const EASNER_MARK_SOURCE = require('../../assets/easner-mark.png')

/** Bundled card-face icon on Cards screen preview. */
export const EASNER_CARD_ICON_SOURCE = require('../../assets/icons/easner-icon.png')

/** Public Easner mark URL (web / fallback). */
export const EASNER_MARK_URL =
  'https://kixymrjsupzkxokujmwu.supabase.co/storage/v1/object/public/brand/Easner%20mark.png'

/**
 * Card face icon URL — business cards use `BRAND.icon`.
 * Native Cards screen uses {@link EASNER_CARD_ICON_SOURCE}.
 */
export const EASNER_CARD_ICON_URL = BRAND.favicon

export type PayeeAccountKind = 'business' | 'personal'
