// Loads Supabase (and API) env for local dev: prefer mobile/.env, else reuse business app keys (monorepo).
const fs = require('fs')
const path = require('path')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function aliasPublicEnv() {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  }
  if (
    !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  }
  if (!process.env.EXPO_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL) {
    process.env.EXPO_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL
  }
}

/** Intercom Expo plugin reads keys only during `eas build` / prebuild — not from the JS bundle. */
function aliasIntercomEnvForConfig() {
  if (!process.env.EXPO_PUBLIC_INTERCOM_APP_ID && process.env.INTERCOM_APP_ID) {
    process.env.EXPO_PUBLIC_INTERCOM_APP_ID = process.env.INTERCOM_APP_ID
  }
  if (!process.env.EXPO_PUBLIC_INTERCOM_IOS_API_KEY && process.env.INTERCOM_IOS_API_KEY) {
    process.env.EXPO_PUBLIC_INTERCOM_IOS_API_KEY = process.env.INTERCOM_IOS_API_KEY
  }
  if (
    !process.env.EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY &&
    process.env.INTERCOM_ANDROID_API_KEY
  ) {
    process.env.EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY = process.env.INTERCOM_ANDROID_API_KEY
  }
  /** Align mobile native region with business web when only NEXT_PUBLIC_INTERCOM_REGION is set locally. */
  if (!process.env.EXPO_PUBLIC_INTERCOM_REGION && process.env.NEXT_PUBLIC_INTERCOM_REGION) {
    process.env.EXPO_PUBLIC_INTERCOM_REGION = process.env.NEXT_PUBLIC_INTERCOM_REGION
  }
}

function isLocalUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(value)
}

module.exports = ({ config }) => {
  loadEnvFile(path.join(__dirname, '.env'))
  loadEnvFile(path.join(__dirname, '..', 'business', '.env.local'))
  loadEnvFile(path.join(__dirname, '..', 'business', '.env'))
  aliasPublicEnv()
  aliasIntercomEnvForConfig()

  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabasePublishableKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''

  const configuredApiUrl = (
    process.env.EXPO_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    ''
  ).replace(/\/$/, '')
  const apiUrl =
    process.env.EAS_BUILD && isLocalUrl(configuredApiUrl)
      ? 'https://api.easner.com'
      : configuredApiUrl

  if (process.env.EAS_BUILD && (!supabaseUrl || !supabasePublishableKey)) {
    console.warn(
      '[easner-mobile] EAS build has no EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. The app will show a startup configuration error instead of crashing; set them in EAS Environment variables and rebuild.'
    )
  }

  if (process.env.EAS_BUILD && !configuredApiUrl) {
    console.warn(
      '[easner-mobile] EAS build has no EXPO_PUBLIC_API_URL / NEXT_PUBLIC_API_URL — profile & Easetag saves require the business app URL. Set it in EAS Environment variables and rebuild.'
    )
  }

  if (process.env.EAS_BUILD && configuredApiUrl && configuredApiUrl !== apiUrl) {
    console.warn(
      `[easner-mobile] EAS build ignored local API URL ${configuredApiUrl}; using ${apiUrl}. Set EXPO_PUBLIC_API_URL for the target backend.`
    )
  }

  const intercomAppId = (process.env.EXPO_PUBLIC_INTERCOM_APP_ID || '').trim()
  const intercomIosKey = (process.env.EXPO_PUBLIC_INTERCOM_IOS_API_KEY || '').trim()
  const intercomAndroidKey = (process.env.EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY || '').trim()
  /** Native SDK expects US | EU | AU (must match Intercom workspace datacenter). Lowercase or web-style values must normalize — otherwise we silently fell back to US and JWT/chat broke for EU workspaces. */
  function normalizeIntercomRegion(raw) {
    const r = (raw || 'US').trim().toLowerCase()
    if (r === 'eu') return 'EU'
    if (r === 'us') return 'US'
    if (r === 'au' || r === 'ap') return 'AU'
    const u = (raw || '').trim().toUpperCase()
    return ['US', 'EU', 'AU'].includes(u) ? u : 'US'
  }
  const intercomRegion = normalizeIntercomRegion(process.env.EXPO_PUBLIC_INTERCOM_REGION)

  const intercomPluginConfigured = Boolean(
    intercomAppId && intercomIosKey && intercomAndroidKey,
  )

  /**
   * Intercom + Expo: https://developers.intercom.com/installing-intercom/react-native/installation#using-intercom-with-expo
   * - Automatic native init: plugin gets appId, iosApiKey, androidApiKey, intercomRegion (US|EU|AU). `useManualInit` omitted → false.
   * - Do not call Intercom.initialize() from JS unless you set useManualInit: true and remove keys from here per docs.
   * - Values are injected from env at prebuild/EAS (same shape as Intercom’s JSON example, without committing keys).
   */
  const intercomPlugins = intercomPluginConfigured
    ? [
        [
          '@intercom/intercom-react-native',
          {
            appId: intercomAppId,
            iosApiKey: intercomIosKey,
            androidApiKey: intercomAndroidKey,
            intercomRegion,
          },
        ],
      ]
    : []

  if (process.env.EAS_BUILD && !intercomPluginConfigured) {
    console.warn(
      '[easner-mobile] Intercom native plugin skipped — live chat needs all of: EXPO_PUBLIC_INTERCOM_APP_ID (or INTERCOM_APP_ID), EXPO_PUBLIC_INTERCOM_IOS_API_KEY (or INTERCOM_IOS_API_KEY), EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY (or INTERCOM_ANDROID_API_KEY). Set them on the EAS Environment for this project and rebuild (OTA alone cannot add native Intercom). See https://developers.intercom.com/installing-intercom/react-native/installation#using-intercom-with-expo',
    )
  }

  const merged = {
    ...config,
    ios: {
      ...(config.ios || {}),
      infoPlist: {
        ...((config.ios && config.ios.infoPlist) || {}),
        NSCameraUsageDescription:
          'Easner uses the camera when you attach photos in support chat.',
        NSMicrophoneUsageDescription:
          'Easner uses the microphone for voice messages in support chat.',
      },
    },
    plugins: [...(config.plugins || []), ...intercomPlugins],
    extra: {
      ...config.extra,
      supabaseUrl,
      supabasePublishableKey,
      apiUrl,
      easetagLedgerP2pEnabled:
        process.env.EXPO_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true' ||
        process.env.NEXT_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true',
      intercomConfigured: intercomPluginConfigured,
      /** Non-secret: lets JS logs confirm the native build matches Intercom Settings → App ID / region. */
      intercomAppId: intercomAppId || undefined,
      intercomRegion,
    },
  }

  // Keep `ios.bundleIdentifier` / `android.package` in the resolved config so `expo prebuild`
  // and tooling can read them. Native projects under `ios/` / `android/` should stay aligned
  // with app.json (re-run prebuild after changing IDs).

  return merged
}
