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
  if (sym === "USDC" || sym === "USDC_TEST") return true
  const name = String(row.name || "").toUpperCase()
  if (name.includes("USD COIN") || name.includes("USDC")) return true
  if (caip19HasMint(String(row.caip19 || ""), SOLANA_USDC_MINTS)) return true
  return false
}

function isEurcBalanceRow(row: BalanceRow): boolean {
  const sym = String(row.symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "")
  if (sym === "EURC" || sym === "EURC_TEST") return true
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
    return {
      USD: "0",
      EUR: "0",
      source: "none",
      balanceCaip2,
      detail: lastErr ? `turnkey_balance_query_failed:${lastErr}` : "turnkey_balance_query_failed",
    }
  }

  return { USD: usd, EUR: eur, source: "turnkey", balanceCaip2 }
}
