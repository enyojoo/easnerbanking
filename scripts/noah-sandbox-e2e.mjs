#!/usr/bin/env node
/**
 * Sandbox E2E smoke (Phase G): hits deployed business API.
 *
 * Usage:
 *   BASE_URL=http://localhost:3001 node scripts/noah-sandbox-e2e.mjs
 *   BASE_URL=http://localhost:3001 JWT=eyJhbG... node scripts/noah-sandbox-e2e.mjs
 *
 * Manual mobile: same BASE_URL in EXPO_PUBLIC_API_URL; sign in; run TOS → KYC → sync; check transactions.
 *
 * Payout rails (US bank, SEPA, mobile Identifier, W2W): see business/docs/noah-payout-sandbox-matrix.md
 *
 * Env: NOAH_API_KEY, NOAH_API_BASE_URL, NOAH_WALLET_TRANSFER_PATH (optional), SUPABASE_* ; webhooks → /api/noah/webhooks (Noah dashboard).
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

  const biz = { ...auth, "X-Easner-Noah-Scope": "business" }
  const avail = await fetch(`${base}/api/accounts/available-currencies`, { headers: biz }).then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => ({})),
  }))
  console.log("GET /api/accounts/available-currencies", avail.status, JSON.stringify(avail.json).slice(0, 300))

  const bal = await fetch(`${base}/api/noah/wallets/balances`, { headers: biz }).then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => ({})),
  }))
  console.log("GET /api/noah/wallets/balances (business scope)", bal.status, JSON.stringify(bal.json).slice(0, 200))

  const va = await fetch(`${base}/api/noah/virtual-accounts?currency=usd`, { headers: biz }).then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => ({})),
  }))
  console.log("GET /api/noah/virtual-accounts?currency=usd (business scope)", va.status, JSON.stringify(va.json).slice(0, 250))

  const w = await fetch(`${base}/api/noah/wallets`, { headers: auth }).then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => ({})),
  }))
  console.log("GET /api/noah/wallets", w.status, JSON.stringify(w.json).slice(0, 400))

  const ucheck = await fetch(`${base}/api/username/check?easetag=testtag123456789`).then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => ({})),
  }))
  console.log("GET /api/username/check", ucheck.status, ucheck.json)

  process.exit(health.ok && verify.status === 200 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
