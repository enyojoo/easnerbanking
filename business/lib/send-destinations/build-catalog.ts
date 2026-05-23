import { createHash } from "crypto"
import type {
  CryptoDestinationPublic,
  ProviderHealthStatus,
  ProviderRoutingEntry,
  SendDestinationsResponse,
} from "@easner/shared"
import type { PayoutCorridorPublic, PayoutRail } from "@easner/shared"
import { annotateCorridorsWithNoahAvailability } from "@/lib/noah/channel-availability"
import { getGlobalCurrencyPolicies } from "@/lib/accounts/currency-controls"
import { getNoahSettlementCryptoCurrency } from "@/lib/noah/config"
import { isExcludedPayoutCorridorCountry } from "@/lib/payout-corridors-exclusions"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type PayoutCorridorRow = {
  id: string
  rail: string
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  sort_order: number | null
  providers: unknown
  provider_routing: unknown
  updated_at: string
}

type CryptoRow = {
  id: string
  asset_code: string
  asset_name: string
  networks: unknown
  country_code: string | null
  sort_order: number | null
  provider_routing: unknown
  updated_at: string
}

function parseProviderRouting(raw: unknown): ProviderRoutingEntry[] {
  if (!Array.isArray(raw)) return []
  const out: ProviderRoutingEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const provider = String(o.provider ?? "").trim()
    const priority = Number(o.priority)
    if (!provider || !Number.isFinite(priority)) continue
    out.push({
      provider,
      priority,
      ...(o.settlement_asset ? { settlement_asset: String(o.settlement_asset) } : {}),
    })
  }
  return out.sort((a, b) => a.priority - b.priority)
}

function publicCorridor(
  row: PayoutCorridorRow & { noah_sell_available?: boolean; provider_health?: Record<string, ProviderHealthStatus> },
): PayoutCorridorPublic {
  return {
    id: row.id,
    rail: row.rail as PayoutRail,
    country_code: row.country_code,
    country_name: row.country_name,
    currency_code: row.currency_code,
    currency_name: row.currency_name,
    sort_order: row.sort_order,
    providers: row.providers,
    provider_routing: parseProviderRouting(row.provider_routing),
    ...(typeof row.noah_sell_available === "boolean" ? { noah_sell_available: row.noah_sell_available } : {}),
    ...(row.provider_health ? { provider_health: row.provider_health } : {}),
  }
}

function publicCrypto(row: CryptoRow): CryptoDestinationPublic {
  const networks = Array.isArray(row.networks)
    ? (row.networks as unknown[]).map((n) => String(n)).filter(Boolean)
    : []
  return {
    id: row.id,
    asset_code: row.asset_code,
    asset_name: row.asset_name,
    networks,
    country_code: row.country_code,
    sort_order: row.sort_order,
    provider_routing: parseProviderRouting(row.provider_routing),
  }
}

function catalogVersion(parts: string[]): string {
  let max = ""
  for (const p of parts) {
    if (p > max) max = p
  }
  return max || new Date(0).toISOString()
}

function weakEtag(body: SendDestinationsResponse): string {
  const h = createHash("sha256")
  h.update(JSON.stringify(body))
  return `W/"${h.digest("base64url")}"`
}

export async function buildSendDestinationsCatalog(input?: {
  annotateProviders?: boolean
  executableOnly?: boolean
}): Promise<{ body: SendDestinationsResponse; etag: string }> {
  const admin = createSupabaseAdmin()
  const annotateProviders = input?.annotateProviders === true
  const executableOnly = input?.executableOnly === true

  const [corridorsRes, cryptoRes, policies] = await Promise.all([
    admin
      .from("payout_corridors")
      .select(
        "id,rail,country_code,country_name,currency_code,currency_name,sort_order,providers,provider_routing,updated_at",
      )
      .eq("enabled", true)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("country_name", { ascending: true }),
    admin
      .from("crypto_destinations")
      .select("id,asset_code,asset_name,networks,country_code,sort_order,provider_routing,updated_at")
      .eq("enabled", true)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("asset_code", { ascending: true }),
    getGlobalCurrencyPolicies(),
  ])

  if (corridorsRes.error) throw new Error(corridorsRes.error.message)
  if (cryptoRes.error) throw new Error(cryptoRes.error.message)

  let fiatRows = ((corridorsRes.data ?? []) as PayoutCorridorRow[]).filter(
    (r) => !isExcludedPayoutCorridorCountry(r.country_code),
  )
  if (annotateProviders) {
    const annotated = await annotateCorridorsWithNoahAvailability(fiatRows)
    fiatRows = annotated.map((row) => {
      const routing = parseProviderRouting(row.provider_routing)
      const hasNoah = routing.some((r) => r.provider === "noah")
      const provider_health: Record<string, ProviderHealthStatus> = {}
      if (hasNoah) {
        provider_health.noah = row.noah_sell_available ? "ok" : "unavailable"
      }
      return { ...row, provider_health }
    })
  }
  if (executableOnly) {
    fiatRows = fiatRows.filter((r) => (r as PayoutCorridorRow & { noah_sell_available?: boolean }).noah_sell_available)
  }

  const bank = fiatRows.filter((r) => r.rail === "bank_transfer").map(publicCorridor)
  const mobile = fiatRows.filter((r) => r.rail === "mobile_money").map(publicCorridor)
  const cryptoByAsset = new Map<string, CryptoDestinationPublic>()
  for (const row of (cryptoRes.data ?? []) as CryptoRow[]) {
    const pub = publicCrypto(row)
    const code = pub.asset_code.toUpperCase()
    const existing = cryptoByAsset.get(code)
    if (!existing) {
      cryptoByAsset.set(code, pub)
      continue
    }
    const nets = new Set([...existing.networks, ...pub.networks])
    cryptoByAsset.set(code, { ...existing, networks: [...nets] })
  }
  const crypto = [...cryptoByAsset.values()]

  const balance_currencies = (["USD", "EUR", "GBP", "NGN"] as const).map((code) => ({
    code,
    available: policies[code].available,
    active: policies[code].active,
  }))

  const versionParts = [
    ...fiatRows.map((r) => r.updated_at),
    ...((cryptoRes.data ?? []) as CryptoRow[]).map((r) => r.updated_at),
    getNoahSettlementCryptoCurrency(),
  ]

  const body: SendDestinationsResponse = {
    catalog_version: catalogVersion(versionParts),
    balance_currencies,
    fiat: { bank_transfer: bank, mobile_money: mobile },
    crypto,
  }

  return { body, etag: weakEtag(body) }
}
