import { APP_URLS } from "./constants/urls"

/** Apple App Store listing (App Store Connect id 6762069433). */
export const EASNER_IOS_APP_STORE_ID = "6762069433"
export const EASNER_IOS_APP_STORE_URL = `https://apps.apple.com/app/id${EASNER_IOS_APP_STORE_ID}`

/** Google Play listing (`android.package` in mobile/app.json). */
export const EASNER_ANDROID_PACKAGE_ID = "com.easner.android"
export const EASNER_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${EASNER_ANDROID_PACKAGE_ID}`

export function nativeStoreListingUrl(platform: "ios" | "android"): string {
  return platform === "ios" ? EASNER_IOS_APP_STORE_URL : EASNER_PLAY_STORE_URL
}

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
