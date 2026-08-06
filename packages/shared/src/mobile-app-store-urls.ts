import { APP_URLS } from "./constants/urls"

export type MobileAppStoreUrls = {
  /** Marketing-site download page (QR target, platform redirects). */
  downloadPage: string
  /** Apple App Store listing. */
  appStore: string
  /** Google Play listing. */
  playStore: string
  /** Personal app web origin (`app.easner.com`). */
  appWeb: string
}

/**
 * Resolve mobile store / download URLs for marketing site + email CTAs.
 * Override via env on the sending service (`EASNER_*`) or pass explicit values.
 */
export function resolveMobileAppStoreUrls(overrides?: {
  downloadPage?: string | null
  appStore?: string | null
  playStore?: string | null
  appWeb?: string | null
}): MobileAppStoreUrls {
  const downloadPage =
    overrides?.downloadPage?.trim() ||
    process.env.EASNER_DOWNLOAD_PAGE_URL?.trim() ||
    APP_URLS.appDownload

  const appStore =
    overrides?.appStore?.trim() ||
    process.env.EASNER_APP_STORE_URL?.trim() ||
    `${downloadPage}?platform=ios`

  const playStore =
    overrides?.playStore?.trim() ||
    process.env.EASNER_PLAY_STORE_URL?.trim() ||
    `${downloadPage}?platform=android`

  const appWeb =
    overrides?.appWeb?.trim() ||
    process.env.NEXT_PUBLIC_MOBILE_APP_URL?.trim() ||
    APP_URLS.app

  return { downloadPage, appStore, playStore, appWeb }
}
