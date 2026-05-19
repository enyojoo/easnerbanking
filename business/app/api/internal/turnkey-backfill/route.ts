import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { backfillTurnkeyHistoricalTransactions } from "@/lib/turnkey/backfill-transactions"
import { backfillTurnkeyOnchainTransactions } from "@/lib/turnkey/onchain-backfill"
import { fillMissingAssociatedTokenAddresses } from "@/lib/wallet/fill-wallet-account-ata"
import { syncWalletBalancesFromSolanaAtaForOwners } from "@/lib/wallet/sync-wallet-balances-from-ata"

export const runtime = "nodejs"

/**
 * Internal one-off repair endpoint to re-ingest historical Turnkey activity
 * into the unified transactions ledger after webhook delivery outages.
 */
export async function POST(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  try {
    const admin = createSupabaseAdmin()
    const ataFill = await fillMissingAssociatedTokenAddresses(admin)
    const [activities, onchain] = await Promise.all([
      backfillTurnkeyHistoricalTransactions(admin),
      backfillTurnkeyOnchainTransactions(admin, {
        // Batch repair: moderate pacing so we do not trip Supabase / RPC limits.
        throttleMsBetweenIngests: 40,
      }),
    ])
    const { data: ownerRows } = await admin.from("wallet_owners").select("id").limit(5000)
    const ownerIds = [
      ...new Set([
        ...onchain.walletOwnerIds,
        ...(ownerRows || []).map((r) => String(r.id)).filter(Boolean),
      ]),
    ]
    const balanceSync = await syncWalletBalancesFromSolanaAtaForOwners(admin, ownerIds)
    return NextResponse.json({ ok: true, result: { ataFill, activities, onchain, balanceSync } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Backfill failed"
    const stack = e instanceof Error ? (e.stack || "").split("\n").slice(0, 4).join("\n") : undefined
    return NextResponse.json({ ok: false, error: msg, stack }, { status: 500 })
  }
}
