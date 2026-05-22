import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getTurnkeyDisplayBalancesUsdEur } from "@/lib/wallet/turnkey-chain-balances"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { upsertWalletBalanceSnapshot } from "@/lib/wallet/wallet-balances-db"

export const runtime = "nodejs"

async function ownerHasActiveSolanaWallets(
  admin: ReturnType<typeof createSupabaseAdmin>,
  walletOwnerId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("wallet_accounts")
    .select("id")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("status", "active")
    .eq("chain", "solana")
    .in("asset", ["USDC", "EURC"])
    .limit(1)
  return (data?.length ?? 0) > 0
}

/**
 * GET — Solana USDC/EURC balances at Turnkey-mapped `wallet_accounts` (chain truth for BYOW).
 * Response: `{ USD, EUR, source, balanceCaip2, detail? }` — `balanceCaip2` is the CAIP-2 network
 * used for Turnkey (verify against deposit network if balances look wrong).
 *
 * @see https://docs.turnkey.com/api-reference/queries/get-balances
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const admin = createSupabaseAdmin()

  const businessId = acc.ctx.scope === "business" ? acc.ctx.subjectBusinessId : null
  const userId = acc.ctx.scope === "individual" ? acc.ctx.subjectUserId : null

  // Prefer DB snapshot so we don't hammer Turnkey (which rate limits with "Resource exhausted").
  try {
    let q = admin
      .from("wallet_balances")
      .select("currency,available_balance,updated_at,version")
      .in("currency", ["USD", "EUR"])
      .limit(2)
    if (businessId) q = q.eq("business_id", businessId)
    if (!businessId && userId) q = q.eq("user_id", userId)
    const { data: rows, error } = await q
    if (!error && rows && rows.length > 0) {
      const map = new Map<string, number>()
      for (const r of rows as any[]) {
        map.set(String(r.currency).toUpperCase(), Number(r.available_balance ?? 0))
      }
      const usd = map.get("USD") ?? 0
      const eur = map.get("EUR") ?? 0
      const dbAllZero = usd === 0 && eur === 0
      if (!dbAllZero) {
        return NextResponse.json({
          USD: String(usd),
          EUR: String(eur),
          source: "db",
          balanceCaip2: "solana:mainnet",
          detail: "wallet_balances_snapshot",
        })
      }
      // Stale ATA zeros can land in wallet_balances when RPC reads fail. Re-verify with
      // Turnkey for provisioned owners instead of serving authoritative $0.00.
      const walletOwnerId = await resolveWalletOwnerIdForEasnerContext(admin, acc.ctx)
      if (!walletOwnerId || !(await ownerHasActiveSolanaWallets(admin, walletOwnerId))) {
        return NextResponse.json({
          USD: "0",
          EUR: "0",
          source: "db",
          balanceCaip2: "solana:mainnet",
          detail: "wallet_balances_snapshot",
        })
      }
    }
  } catch {
    // If the table doesn't exist yet (migration not applied), fall back to Turnkey.
  }

  const result = await getTurnkeyDisplayBalancesUsdEur(admin, acc.ctx)

  // Persist DB snapshot when Turnkey returns an authoritative read.
  // This enables realtime dashboards to update without hammering Turnkey.
  if (result.source === "turnkey") {
    try {
      await Promise.all([
        upsertWalletBalanceSnapshot(admin, {
          businessId,
          userId,
          currency: "USD",
          availableBalance: Number(result.USD) || 0,
        }),
        upsertWalletBalanceSnapshot(admin, {
          businessId,
          userId,
          currency: "EUR",
          availableBalance: Number(result.EUR) || 0,
        }),
      ])
    } catch (e) {
      // Don't fail the endpoint if balance snapshot persistence isn't available yet,
      // but log it so we can detect schema/policy issues in production.
      const msg = e instanceof Error ? e.message : String(e)
      console.warn("[on-chain-balances] failed to persist wallet_balances snapshot:", msg)
    }
  }

  return NextResponse.json({
    USD: result.USD,
    EUR: result.EUR,
    source: result.source,
    balanceCaip2: result.balanceCaip2,
    ...(result.detail ? { detail: result.detail } : {}),
  })
}
