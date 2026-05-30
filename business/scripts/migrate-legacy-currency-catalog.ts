/**
 * Migrate legacy Office "Currencies" tab state into send-destinations tables.
 *
 * Sources:
 * - system_settings keys currency_active_<CODE> (former Currencies tab toggles)
 * - public.currencies.can_send (if rows exist)
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/migrate-legacy-currency-catalog.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"

const CRYPTO_CODES = new Set(["USDC", "USDT", "EURC"])

const CRYPTO_NAMES: Record<string, string> = {
  USDC: "USD Coin",
  USDT: "Tether USD",
  EURC: "Euro Coin",
}

const WALLET_NETWORKS: Record<string, string[]> = {
  USDC: ["Solana", "Ethereum", "Base", "PolygonPos", "BSC"],
  USDT: ["Tron", "Ethereum", "BSC", "PolygonPos", "Solana"],
  EURC: ["Solana"],
}

const ROUTING_BY_ASSET: Record<string, Array<{ provider: string; priority: number; settlement_asset: string }>> = {
  USDC: [
    { provider: "turnkey", priority: 1, settlement_asset: "USDC" },
    { provider: "lifi", priority: 2, settlement_asset: "USDC" },
  ],
  USDT: [{ provider: "lifi", priority: 1, settlement_asset: "USDC" }],
  EURC: [{ provider: "turnkey", priority: 1, settlement_asset: "EURC" }],
}

function normalizeBool(v: unknown): boolean | null {
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true
  if (s === "false" || s === "0" || s === "no" || s === "off") return false
  return null
}

async function loadCurrencyActiveOverrides(admin: ReturnType<typeof createSupabaseAdmin>) {
  const { data, error } = await admin
    .from("system_settings")
    .select("key,value")
    .eq("category", "currency")
    .like("key", "currency_active_%")

  if (error) throw error

  const out: Record<string, boolean> = {}
  for (const row of data ?? []) {
    const key = String((row as { key?: string }).key || "")
    const code = key.replace(/^currency_active_/, "").trim().toUpperCase()
    if (!code) continue
    const parsed = normalizeBool((row as { value?: unknown }).value)
    if (parsed == null) continue
    out[code] = parsed
  }
  return out
}

async function upsertCryptoAsset(
  admin: ReturnType<typeof createSupabaseAdmin>,
  code: string,
  enabled: boolean,
) {
  const name = CRYPTO_NAMES[code] ?? code
  const networks = WALLET_NETWORKS[code] ?? []

  const { data: existing } = await admin
    .from("crypto_destinations")
    .select("id")
    .eq("asset_code", code)
    .maybeSingle()

  const payload = {
    asset_code: code,
    asset_name: name,
    networks,
    country_code: null,
    enabled,
    provider_routing: ROUTING_BY_ASSET[code] ?? [],
    sort_order: null,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error } = await admin.from("crypto_destinations").update(payload).eq("id", existing.id)
    if (error) console.warn("crypto update", code, error.message)
    else console.log("crypto updated", code, enabled)
    return
  }

  const { error } = await admin.from("crypto_destinations").insert(payload)
  if (error) console.warn("crypto insert", code, error.message)
  else console.log("crypto inserted", code, enabled)
}

async function dedupeCryptoByAsset(admin: ReturnType<typeof createSupabaseAdmin>) {
  const { data } = await admin.from("crypto_destinations").select("*")
  const byAsset = new Map<string, (typeof data)[number][]>()
  for (const row of data ?? []) {
    const code = String(row.asset_code || "").toUpperCase()
    const list = byAsset.get(code) ?? []
    list.push(row)
    byAsset.set(code, list)
  }
  for (const [code, list] of byAsset) {
    if (list.length <= 1) continue
    const keep =
      list.find((r) => !r.country_code) ??
      list.sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]
    const drop = list.filter((r) => r.id !== keep.id)
    for (const row of drop) {
      await admin.from("crypto_destinations").delete().eq("id", row.id)
      console.log("crypto dedupe removed", code, row.country_code ?? "scoped")
    }
  }
}

async function main() {
  const admin = createSupabaseAdmin()
  await dedupeCryptoByAsset(admin)
  const overrides = await loadCurrencyActiveOverrides(admin)

  const { data: currencyRows } = await admin.from("currencies").select("code,can_send")
  for (const row of currencyRows ?? []) {
    const code = String((row as { code?: string }).code || "").toUpperCase()
    if (!code) continue
    const canSend = (row as { can_send?: boolean }).can_send
    if (typeof canSend === "boolean" && overrides[code] === undefined) {
      overrides[code] = canSend
    }
  }

  console.log("Applying legacy currency_active / currencies.can_send to send destinations…")

  for (const [code, active] of Object.entries(overrides)) {
    if (CRYPTO_CODES.has(code)) {
      await upsertCryptoAsset(admin, code, active)
      continue
    }

    const { error } = await admin
      .from("payout_corridors")
      .update({ enabled: active, updated_at: new Date().toISOString() })
      .eq("currency_code", code)

    if (error) {
      console.warn("fiat corridors", code, error.message)
    } else {
      console.log("fiat corridors", code, "enabled=", active)
    }
  }

  // Ensure crypto catalog rows exist (disabled unless override says otherwise)
  for (const code of CRYPTO_CODES) {
    const enabled = overrides[code] ?? false
    const { count } = await admin
      .from("crypto_destinations")
      .select("id", { count: "exact", head: true })
      .eq("asset_code", code)
    if ((count ?? 0) === 0) {
      await upsertCryptoAsset(admin, code, enabled)
    }
  }

  console.log("Done. Run seed-payout-corridors.ts first if payout_corridors is empty.")
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
