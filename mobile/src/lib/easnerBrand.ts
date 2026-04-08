import { BRAND } from '@easner/shared'

/** Public Easner mark — badge for Easetag / in-network recipients */
export const EASNER_MARK_URL =
  'https://kixymrjsupzkxokujmwu.supabase.co/storage/v1/object/public/brand/Easner%20mark.png'

/**
 * Card face icon — business cards use `BRAND.icon` (`/easner-icon.png`, not always in repo).
 * Mobile uses the shared favicon from the same brand bucket (reliable PNG URL).
 */
export const EASNER_CARD_ICON_URL = BRAND.favicon

export type PayeeAccountKind = 'business' | 'personal'
