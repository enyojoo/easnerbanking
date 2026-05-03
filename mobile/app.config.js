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

function isLocalUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(value)
}

module.exports = ({ config }) => {
  loadEnvFile(path.join(__dirname, '.env'))
  loadEnvFile(path.join(__dirname, '..', 'business', '.env.local'))
  loadEnvFile(path.join(__dirname, '..', 'business', '.env'))
  aliasPublicEnv()

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

  const merged = {
    ...config,
    extra: {
      ...config.extra,
      supabaseUrl,
      supabasePublishableKey,
      apiUrl,
      easetagLedgerP2pEnabled:
        process.env.EXPO_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true' ||
        process.env.NEXT_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true',
    },
  }

  // Keep `ios.bundleIdentifier` / `android.package` in the resolved config so `expo prebuild`
  // and tooling can read them. Native projects under `ios/` / `android/` should stay aligned
  // with app.json (re-run prebuild after changing IDs).

  return merged
}
