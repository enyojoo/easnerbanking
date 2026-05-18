import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getTurnkeyApiClientForSubOrganization } from "@/lib/turnkey/client"
import {
  getTurnkeyBalanceCaip2,
  getTurnkeyFallbackSubOrganizationId,
  isTurnkeyConfigured,
  isTurnkeyOnChainBalanceQueryEnabled,
} from "@/lib/turnkey/config"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"

type TurnkeyBalanceResult = Awaited<ReturnType<typeof getTurnkeyDisplayBalancesUsdEur>>

type CacheEntry = {
  value: TurnkeyBalanceResult
  fetchedAt: number
  cooldownUntil: number
  inFlight?: Promise<TurnkeyBalanceResult>
}

/**
 * Process-local cache & in-flight de-dupe for Turnkey balance queries.
 *
 * Turnkey will occasionally return `Resource exhausted` (rate limiting / capacity).
 * Without caching, every reload + multi-tab can stampede Turnkey and we end up
 * returning `{ USD: "0", EUR: "0", source: "none" }`, which the UI renders as `0.00`.
 *
 * This cache ensures:
 * - multiple callers share the same in-flight request
 * - we return last-known-good Turnkey balances during transient failures
 * - we back off during "resource exhausted" windows to avoid repeated failures
 */
const BALANCE_CACHE = new Map<string, CacheEntry>()
const OK_TTL_MS = 30_000
const DEFAULT_COOLDOWN_MS = 60_000

function cacheKey(params: { ownerId: string; subOrg: string; balanceCaip2: string }): string {
  return `${params.ownerId}:${params.subOrg}:${params.balanceCaip2}`
}

function isResourceExhausted(detail: string | undefined): boolean {
  const d = String(detail ?? "")
  return /resource exhausted/i.test(d)
}

/**
 * Convert atomic integer string to a decimal string (no locale), for display sums.
 */
export function atomicBalanceToDecimalString(atomic: string, decimals: number): string {
  if (!/^-?\d+$/.test(atomic.trim())) return "0"
  const neg = atomic.trim().startsWith("-")
  const a = neg ? atomic.trim().slice(1) : atomic.trim()
  const d = Math.max(0, Math.min(18, Math.floor(decimals)))
  if (d === 0) return (neg ? "-" : "") + a
  const padded = a.padStart(d + 1, "0")
  const intPart = padded.slice(0, -d).replace(/^0+(?=\d)/, "") || "0"
  let frac = padded.slice(-d).replace(/0+$/, "")
  if (!frac) return (neg ? "-" : "") + intPart
  return (neg ? "-" : "") + `${intPart}.${frac}`
}

function parseDecimalSum(a: string, b: string): string {
  const x = parseFloat(a) || 0
  const y = parseFloat(b) || 0
  const s = x + y
  if (!Number.isFinite(s)) return a
  return String(s)
}

/** @see https://developers.circle.com/stablecoins/usdc-contract-addresses */
const SOLANA_USDC_MINTS = [
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
] as const

/** @see https://developers.circle.com/stablecoins/eurc-contract-addresses */
const SOLANA_EURC_MINTS = ["HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr"] as const

type BalanceRow = {
  symbol?: string
  balance?: string
  decimals?: number
  caip19?: string
  name?: string
  display?: { usd?: string; crypto?: string }
}

function caip19HasMint(caip19: string, mints: readonly string[]): boolean {
  const lower = caip19.toLowerCase()
  return mints.some((m) => lower.includes(m.toLowerCase()))
}

function isUsdcBalanceRow(row: BalanceRow): boolean {
  const sym = String(row.symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "")
  if (sym === "USDC") return true
  const name = String(row.name || "").toUpperCase()
  if (name.includes("USD COIN") || name.includes("USDC")) return true
  if (caip19HasMint(String(row.caip19 || ""), SOLANA_USDC_MINTS)) return true
  return false
}

function isEurcBalanceRow(row: BalanceRow): boolean {
  const sym = String(row.symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "")
  if (sym === "EURC") return true
  const name = String(row.name || "").toUpperCase()
  if (name.includes("EURO COIN") || name.includes("EURC")) return true
  if (caip19HasMint(String(row.caip19 || ""), SOLANA_EURC_MINTS)) return true
  return false
}

/**
 * Prefer atomic integer `balance` + `decimals`; fall back to decimal `balance` or `display.crypto`
 * if Turnkey returns a non-integer shape.
 */
function balanceRowToDecimalAmount(row: BalanceRow): string {
  const raw = String(row.balance ?? "").trim()
  const dec = Number(row.decimals ?? 6)
  const d = Number.isFinite(dec) ? dec : 6

  if (/^-?\d+$/.test(raw)) {
    return atomicBalanceToDecimalString(raw, d)
  }
  if (raw && Number.isFinite(parseFloat(raw))) {
    return String(parseFloat(raw))
  }
  const crypto = String(row.display?.crypto ?? "").trim()
  if (crypto) {
    const n = parseFloat(crypto.replace(/,/g, ""))
    if (Number.isFinite(n)) return String(n)
  }
  return "0"
}

function accumulateStablecoinLine(
  rows: BalanceRow[] | undefined,
  usdTotal: string,
  eurTotal: string,
): { usd: string; eur: string } {
  let usd = usdTotal
  let eur = eurTotal
  for (const row of rows || []) {
    const amt = balanceRowToDecimalAmount(row)
    if (isUsdcBalanceRow(row)) {
      usd = parseDecimalSum(usd, amt)
    }
    if (isEurcBalanceRow(row)) {
      eur = parseDecimalSum(eur, amt)
    }
  }
  return { usd, eur }
}

/**
 * USD/EUR **display** amounts from Turnkey `getWalletAddressBalances` on Solana addresses in `wallet_accounts`.
 * Maps USDC → USD line, EURC → EUR line (stablecoin-as-fiat UX).
 *
 * @see https://docs.turnkey.com/concepts/balances
 */
export async function getTurnkeyDisplayBalancesUsdEur(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
): Promise<{
  USD: string
  EUR: string
  source: "turnkey" | "none"
  /** CAIP-2 value the server uses for Turnkey balance queries (from `TURNKEY_BALANCE_CAIP2` or default). */
  balanceCaip2: string
  detail?: string
}> {
  const balanceCaip2 = getTurnkeyBalanceCaip2()

  if (!isTurnkeyOnChainBalanceQueryEnabled()) {
    return { USD: "0", EUR: "0", source: "none", balanceCaip2, detail: "disabled_by_env" }
  }
  if (!isTurnkeyConfigured()) {
    return { USD: "0", EUR: "0", source: "none", balanceCaip2, detail: "turnkey_not_configured" }
  }

  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, ctx)
  if (!ownerId) {
    return { USD: "0", EUR: "0", source: "none", balanceCaip2, detail: "no_wallet_owner" }
  }

  const { data: ownerRow } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", ownerId)
    .maybeSingle()

  const subOrg =
    String(ownerRow?.turnkey_sub_organization_id || "").trim() || getTurnkeyFallbackSubOrganizationId()
  if (!subOrg) {
    return { USD: "0", EUR: "0", source: "none", balanceCaip2, detail: "no_sub_org" }
  }

  const key = cacheKey({ ownerId, subOrg, balanceCaip2 })
  const now = Date.now()
  const cached = BALANCE_CACHE.get(key)
  if (cached?.inFlight) {
    return await cached.inFlight
  }
  if (cached?.value?.source === "turnkey") {
    if (now < cached.cooldownUntil) {
      return { ...cached.value, detail: "cached_due_to_turnkey_cooldown" }
    }
    if (now - cached.fetchedAt < OK_TTL_MS) {
      return cached.value
    }
  }

  const { data: accounts } = await admin
    .from("wallet_accounts")
    .select("address, asset, chain")
    .eq("wallet_owner_id", ownerId)
    .eq("chain", "solana")
    .eq("status", "active")
    .in("asset", ["USDC", "EURC"])

  const addresses = [...new Set((accounts || []).map((a) => String(a.address || "").trim()).filter(Boolean))]
  if (addresses.length === 0) {
    return { USD: "0", EUR: "0", source: "none", balanceCaip2, detail: "no_active_solana_accounts" }
  }

  const client = getTurnkeyApiClientForSubOrganization(subOrg)
  if (!client) {
    return { USD: "0", EUR: "0", source: "none", balanceCaip2, detail: "no_turnkey_client" }
  }

  const gw = client as {
    getWalletAddressBalances?: (input: {
      organizationId: string
      address: string
      caip2: string
    }) => Promise<{ balances?: BalanceRow[] }>
  }
  if (typeof gw.getWalletAddressBalances !== "function") {
    return {
      USD: "0",
      EUR: "0",
      source: "none",
      balanceCaip2,
      detail: "getWalletAddressBalances_unavailable_in_sdk",
    }
  }

  const run = (async (): Promise<TurnkeyBalanceResult> => {
  let usd = "0"
  let eur = "0"
  let anyOk = false
  let lastErr: string | undefined

  for (const address of addresses) {
    try {
      const res = await gw.getWalletAddressBalances({
        organizationId: subOrg,
        address,
        caip2: balanceCaip2,
      })
      const line = accumulateStablecoinLine(res.balances, "0", "0")
      usd = parseDecimalSum(usd, line.usd)
      eur = parseDecimalSum(eur, line.eur)
      anyOk = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastErr = msg.slice(0, 200)
    }
  }

  if (!anyOk) {
    const failed: TurnkeyBalanceResult = {
      USD: "0",
      EUR: "0",
      source: "none",
      balanceCaip2,
      detail: lastErr ? `turnkey_balance_query_failed:${lastErr}` : "turnkey_balance_query_failed",
    }
    const prevOk = BALANCE_CACHE.get(key)?.value
    if (prevOk?.source === "turnkey") {
      // Serve stale-but-correct values instead of "0.00" during transient Turnkey failures.
      // Apply a cooldown if Turnkey explicitly rate-limited us.
      const exhausted = isResourceExhausted(failed.detail)
      const nextCooldown = exhausted ? now + DEFAULT_COOLDOWN_MS : now + 15_000
      BALANCE_CACHE.set(key, {
        value: prevOk,
        fetchedAt: BALANCE_CACHE.get(key)?.fetchedAt ?? now,
        cooldownUntil: Math.max(BALANCE_CACHE.get(key)?.cooldownUntil ?? 0, nextCooldown),
      })
      return { ...prevOk, detail: exhausted ? "served_cached_due_to_resource_exhausted" : "served_cached_due_to_transient_failure" }
    }
    return failed
  }

    const ok: TurnkeyBalanceResult = { USD: usd, EUR: eur, source: "turnkey", balanceCaip2 }
    return ok
  })()

  BALANCE_CACHE.set(key, {
    value: cached?.value ?? { USD: "0", EUR: "0", source: "none", balanceCaip2, detail: "warming_cache" },
    fetchedAt: cached?.fetchedAt ?? 0,
    cooldownUntil: cached?.cooldownUntil ?? 0,
    inFlight: run,
  })

  try {
    const result = await run
    if (result.source === "turnkey") {
      BALANCE_CACHE.set(key, { value: result, fetchedAt: Date.now(), cooldownUntil: 0 })
    } else {
      // Maintain any cooldown set by failure handling above.
      const after = BALANCE_CACHE.get(key)
      BALANCE_CACHE.set(key, {
        value: after?.value ?? result,
        fetchedAt: after?.fetchedAt ?? 0,
        cooldownUntil: after?.cooldownUntil ?? 0,
      })
    }
    return result
  } finally {
    const after = BALANCE_CACHE.get(key)
    if (after?.inFlight) {
      // Clear inFlight pointer without dropping cached value.
      BALANCE_CACHE.set(key, {
        value: after.value,
        fetchedAt: after.fetchedAt,
        cooldownUntil: after.cooldownUntil,
      })
    }
  }
}
