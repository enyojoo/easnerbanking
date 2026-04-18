import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import {
  getTurnkeyFallbackSubOrganizationId,
  isTurnkeyConfigured,
  isTurnkeyOnChainBalanceQueryEnabled,
} from "@/lib/turnkey/config"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"

/** @see https://docs.turnkey.com/api-reference/queries/get-balances */
export const TURNKEY_SOLANA_MAINNET_CAIP2 =
  process.env.TURNKEY_BALANCE_CAIP2?.trim() || "solana:mainnet"

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

type BalanceRow = {
  symbol?: string
  balance?: string
  decimals?: number
}

function accumulateStablecoinLine(
  rows: BalanceRow[] | undefined,
  usdTotal: string,
  eurTotal: string,
): { usd: string; eur: string } {
  let usd = usdTotal
  let eur = eurTotal
  for (const row of rows || []) {
    const sym = String(row.symbol || "").toUpperCase()
    const dec = Number(row.decimals ?? 6)
    const amt = atomicBalanceToDecimalString(String(row.balance ?? "0"), Number.isFinite(dec) ? dec : 6)
    if (sym === "USDC" || sym === "USDC_TEST") {
      usd = parseDecimalSum(usd, amt)
    }
    if (sym === "EURC" || sym === "EURC_TEST") {
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
  detail?: string
}> {
  if (!isTurnkeyOnChainBalanceQueryEnabled()) {
    return { USD: "0", EUR: "0", source: "none", detail: "disabled_by_env" }
  }
  if (!isTurnkeyConfigured()) {
    return { USD: "0", EUR: "0", source: "none", detail: "turnkey_not_configured" }
  }

  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, ctx)
  if (!ownerId) {
    return { USD: "0", EUR: "0", source: "none", detail: "no_wallet_owner" }
  }

  const { data: ownerRow } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", ownerId)
    .maybeSingle()

  const subOrg =
    String(ownerRow?.turnkey_sub_organization_id || "").trim() || getTurnkeyFallbackSubOrganizationId()
  if (!subOrg) {
    return { USD: "0", EUR: "0", source: "none", detail: "no_sub_org" }
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
    return { USD: "0", EUR: "0", source: "none", detail: "no_active_solana_accounts" }
  }

  const client = getTurnkeyApiClient()
  if (!client) {
    return { USD: "0", EUR: "0", source: "none", detail: "no_turnkey_client" }
  }

  const gw = client as {
    getWalletAddressBalances?: (input: {
      organizationId: string
      address: string
      caip2: string
    }) => Promise<{ balances?: BalanceRow[] }>
  }
  if (typeof gw.getWalletAddressBalances !== "function") {
    return { USD: "0", EUR: "0", source: "none", detail: "getWalletAddressBalances_unavailable_in_sdk" }
  }

  let usd = "0"
  let eur = "0"
  let anyOk = false

  for (const address of addresses) {
    try {
      const res = await gw.getWalletAddressBalances({
        organizationId: subOrg,
        address,
        caip2: TURNKEY_SOLANA_MAINNET_CAIP2,
      })
      const line = accumulateStablecoinLine(res.balances, "0", "0")
      usd = parseDecimalSum(usd, line.usd)
      eur = parseDecimalSum(eur, line.eur)
      anyOk = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        USD: "0",
        EUR: "0",
        source: "none",
        detail: `turnkey_balance_query_failed:${msg.slice(0, 200)}`,
      }
    }
  }

  return {
    USD: usd,
    EUR: eur,
    source: anyOk ? "turnkey" : "none",
  }
}
