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

  const apiUrl =
    (process.env.EXPO_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      '')
      .replace(/\/$/, '') || ''

  return {
    ...config,
    extra: {
      ...config.extra,
      supabaseUrl,
      supabasePublishableKey,
      apiUrl,
    },
  }
}
