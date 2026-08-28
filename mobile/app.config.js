// Loads Supabase (and API) env for local dev: prefer mobile/.env, else reuse business app keys (monorepo).
const fs = require('fs')
const path = require('path')

// EAS Build hoists expo-* config plugins (e.g. expo-system-ui) to the workspace
// root, but `expo` itself often stays in mobile/node_modules. The hoisted plugin
// then fails with "Cannot find module 'expo/config-plugins'". The mobile
// postinstall + eas-build-post-install hooks normally fix this via
// scripts/linkWorkspaceDeps.js, but EAS Build's step-based pipeline (with
// NPM_CONFIG_IGNORE_SCRIPTS=true) skips both, so we self-bootstrap here. This
// runs before EAS' withPlugins resolves plugins from the loaded app config.
;(function ensureExpoLinkedToRoot() {
  try {
    const mobileDir = __dirname
    const rootDir = path.resolve(mobileDir, '..')
    const rootNm = path.join(rootDir, 'node_modules')
    const mobileNm = path.join(mobileDir, 'node_modules')
    if (!fs.existsSync(rootNm)) return
    const expoSrc = path.join(mobileNm, 'expo')
    const expoDest = path.join(rootNm, 'expo')
    if (fs.existsSync(expoSrc) && !fs.existsSync(expoDest)) {
      try {
        fs.symlinkSync(expoSrc, expoDest)
      } catch (e) {
        if (e && e.code !== 'EEXIST') {
          console.warn('[app.config] expo→root symlink failed:', e.message)
        }
      }
    }
    for (const name of ['@expo/config-plugins', '@expo/config']) {
      const src = path.join(rootNm, name)
      const dest = path.join(mobileNm, name)
      if (!fs.existsSync(src)) continue
      if (fs.existsSync(dest)) continue
      const destParent = path.dirname(dest)
      try {
        if (!fs.existsSync(destParent)) fs.mkdirSync(destParent, { recursive: true })
        fs.symlinkSync(src, dest)
      } catch (e) {
        if (e && e.code !== 'EEXIST') {
          console.warn('[app.config]', name, 'symlink failed:', e.message)
        }
      }
    }
  } catch (e) {
    console.warn('[app.config] ensureExpoLinkedToRoot failed:', e && e.message)
  }
})()

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

function aliasIntercomEnvFromBusiness() {
  if (!process.env.EXPO_PUBLIC_INTERCOM_APP_ID && process.env.NEXT_PUBLIC_INTERCOM_APP_ID) {
    process.env.EXPO_PUBLIC_INTERCOM_APP_ID = process.env.NEXT_PUBLIC_INTERCOM_APP_ID
  }
  if (!process.env.EXPO_PUBLIC_INTERCOM_REGION && process.env.NEXT_PUBLIC_INTERCOM_REGION) {
    process.env.EXPO_PUBLIC_INTERCOM_REGION = process.env.NEXT_PUBLIC_INTERCOM_REGION
  }
}

/** Expo plugin expects US | EU | AU */
function parseIntercomPluginRegion(raw) {
  const s = (raw || '').trim()
  const upper = s.toUpperCase()
  if (upper === 'EU' || upper === 'EUROPE') return 'EU'
  if (upper === 'AU' || upper === 'AP' || upper === 'AUSTRALIA') return 'AU'
  if (upper === 'US' || upper === 'USA') return 'US'
  const lower = s.toLowerCase()
  if (lower === 'eu') return 'EU'
  if (lower === 'ap' || lower === 'au') return 'AU'
  return 'US'
}

function isLocalUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(value)
}

module.exports = ({ config }) => {
  loadEnvFile(path.join(__dirname, '.env'))
  loadEnvFile(path.join(__dirname, '..', 'business', '.env.local'))
  loadEnvFile(path.join(__dirname, '..', 'business', '.env'))
  aliasPublicEnv()
  aliasIntercomEnvFromBusiness()

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
      '[easner-mobile] EAS build has no EXPO_PUBLIC_API_URL / NEXT_PUBLIC_API_URL – profile & Easetag saves require the business app URL. Set it in EAS Environment variables and rebuild.'
    )
  }

  if (process.env.EAS_BUILD && configuredApiUrl && configuredApiUrl !== apiUrl) {
    console.warn(
      `[easner-mobile] EAS build ignored local API URL ${configuredApiUrl}; using ${apiUrl}. Set EXPO_PUBLIC_API_URL for the target backend.`
    )
  }

  const intercomAppId =
    process.env.EXPO_PUBLIC_INTERCOM_APP_ID?.trim() ||
    process.env.INTERCOM_APP_ID?.trim() ||
    ''
  const intercomIosApiKey =
    process.env.EXPO_PUBLIC_INTERCOM_IOS_API_KEY?.trim() ||
    process.env.INTERCOM_IOS_API_KEY?.trim() ||
    ''
  const intercomAndroidApiKey =
    process.env.EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY?.trim() ||
    process.env.INTERCOM_ANDROID_API_KEY?.trim() ||
    ''
  const intercomRegion = parseIntercomPluginRegion(
    process.env.EXPO_PUBLIC_INTERCOM_REGION || process.env.NEXT_PUBLIC_INTERCOM_REGION || 'US'
  )

  const intercomKeysReady =
    Boolean(intercomAppId && intercomIosApiKey && intercomAndroidApiKey)
  const intercomWebReady = Boolean(intercomAppId)
  const appleWebClientId =
    process.env.EXPO_PUBLIC_APPLE_WEB_CLIENT_ID?.trim() || 'com.easner.mobile.web'
  const appleWebRedirectUri = process.env.EXPO_PUBLIC_APPLE_WEB_REDIRECT_URI?.trim() || ''
  const googleServicesFile =
    process.env.EXPO_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
    (fs.existsSync(path.join(__dirname, 'google-services.json'))
      ? './google-services.json'
      : '')

  const intercomPlugins = intercomKeysReady
    ? [
        [
          '@intercom/intercom-react-native',
          {
            /** Avoid embedding SDK keys in committed native sources; init from JS (`src/lib/intercom.ts`). */
            useManualInit: true,
            intercomRegion,
          },
        ],
      ]
    : []

  if (
    process.env.EAS_BUILD &&
    !intercomKeysReady &&
    (intercomAppId || intercomIosApiKey || intercomAndroidApiKey)
  ) {
    console.warn(
      '[easner-mobile] Intercom env is incomplete – set EXPO_PUBLIC_INTERCOM_APP_ID, EXPO_PUBLIC_INTERCOM_IOS_API_KEY, and EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY (or INTERCOM_* equivalents) for native messenger.'
    )
  }

  if (process.env.EAS_BUILD && !googleServicesFile) {
    console.warn(
      '[easner-mobile] Android push needs Firebase google-services.json. Add mobile/google-services.json or set EXPO_ANDROID_GOOGLE_SERVICES_FILE, then rebuild Android.'
    )
  }

  const merged = {
    ...config,
    web: {
      ...(config.web || {}),
      orientation: 'portrait',
    },
    android: {
      ...(config.android || {}),
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    ios: {
      ...(config.ios || {}),
      infoPlist: {
        ...((config.ios && config.ios.infoPlist) || {}),
        NSCameraUsageDescription:
          'Easner uses the camera to scan wallet QR codes and when you take or attach photos.',
        NSMicrophoneUsageDescription:
          'Easner uses the microphone when you record or send audio.',
        NSPhotoLibraryAddUsageDescription:
          'Easner saves your transaction receipts to Photos when you download them.',
      },
    },
    plugins: [
      ...(config.plugins || []),
      [
        'expo-camera',
        {
          cameraPermission:
            'Allow Easner to access your camera to scan wallet address QR codes.',
          recordAudioAndroid: false,
          barcodeScannerEnabled: true,
        },
      ],
      [
        'expo-media-library',
        {
          photosPermission: 'Allow Easner to save transaction receipts to your photos.',
          savePhotosPermission: 'Allow Easner to save transaction receipts to your photos.',
          isAccessMediaLocationEnabled: false,
          /** Save-only on Android – no READ_MEDIA_IMAGES/VIDEO (Play photo picker policy). */
          granularPermissions: [],
        },
      ],
      './plugins/withHermesCompilerPath.js',
      './plugins/withInternalExpoImport.js',
      './plugins/withAndroidStoragePermissionsMaxSdk.js',
      './plugins/withAndroidBlockedMediaReadPermissions.js',
      './plugins/withStripeOnrampAndroid.js',
      ...intercomPlugins,
    ],
    extra: {
      ...config.extra,
      supabaseUrl,
      supabasePublishableKey,
      apiUrl,
      intercomConfigured: intercomKeysReady,
      ...(intercomWebReady
        ? {
            intercomAppId,
            intercomRegion,
          }
        : {}),
      ...(intercomKeysReady
        ? {
            intercomIosApiKey,
            intercomAndroidApiKey,
          }
        : {}),
      easetagLedgerP2pEnabled:
        process.env.EXPO_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true' ||
        process.env.NEXT_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true',
      appleWebClientId,
      ...(appleWebRedirectUri ? { appleWebRedirectUri } : {}),
    },
  }

  // Keep `ios.bundleIdentifier` / `android.package` in the resolved config so `expo prebuild`
  // and tooling can read them. Native projects under `ios/` / `android/` should stay aligned
  // with app.json (re-run prebuild after changing IDs).

  return merged
}
