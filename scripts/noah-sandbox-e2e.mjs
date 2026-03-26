#!/usr/bin/env node
/**
 * Sandbox E2E smoke (Phase G): hits deployed business API.
 *
 * Usage:
 *   BASE_URL=http://localhost:3001 node scripts/noah-sandbox-e2e.mjs
 *   BASE_URL=http://localhost:3001 JWT=eyJhbG... node scripts/noah-sandbox-e2e.mjs
 *
 * Manual mobile: same BASE_URL in EXPO_PUBLIC_API_URL; sign in; run TOS → KYC → sync; check transactions.
 */

const base = (process.env.BASE_URL || "http://localhost:3001").replace(/\/$/, "")
const jwt = process.env.JWT

async function get(path) {
  const r = await fetch(`${base}${path}`)
  const text = await r.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { ok: r.ok, status: r.status, json }
}

async function main() {
  console.log("BASE_URL", base)

  let health
  try {
    health = await get("/api/health")
  } catch (e) {
    console.error("GET /api/health failed — is the business server running?", e.message || e)
    process.exit(1)
  }
  console.log("GET /api/health", health.status, health.json)

  if (!jwt) {
    console.log("\nSet JWT to test authenticated routes (Supabase access_token for a user or admin).")
    process.exit(health.ok ? 0 : 1)
  }

  const auth = { Authorization: `Bearer ${jwt}` }
  const verify = await fetch(`${base}/api/auth/verify`, { headers: auth }).then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => ({})),
  }))
  console.log("GET /api/auth/verify", verify.status, verify.json)

  const noah = await fetch(`${base}/api/noah/customers`, { headers: auth }).then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => ({})),
  }))
  console.log("GET /api/noah/customers", noah.status, JSON.stringify(noah.json).slice(0, 200))

  process.exit(health.ok && verify.status === 200 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
