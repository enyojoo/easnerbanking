import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { reconcileNoahBankOnrampCreditsForOwner } from "@/lib/noah/credit-bank-onramp-wallet"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { backfillTurnkeyOnchainTransactions } from "@/lib/turnkey/onchain-backfill"
import { syncWalletBalancesFromSolanaAtaForOwner } from "@/lib/wallet/sync-wallet-balances-from-ata"

export const runtime = "nodejs"

const MIN_SYNC_INTERVAL_MS = 10 * 60_000
const lastSyncAtByOwner = new Map<string, number>()
const inFlightByOwner = new Map<string, Promise<unknown>>()

function txBackfillEnabled(): boolean {
  return process.env.SYNC_CHAIN_LEDGER_TX_BACKFILL === "1" || process.env.SYNC_CHAIN_LEDGER_TX_BACKFILL === "true"
}

async function runOwnerLedgerSync(
  admin: ReturnType<typeof createSupabaseAdmin>,
  walletOwnerId: string,
  ledgerScope: { userId: string; businessId: string | null },
) {
  const balanceSync = await syncWalletBalancesFromSolanaAtaForOwner(admin, walletOwnerId)
  const noahReconcile = await reconcileNoahBankOnrampCreditsForOwner(admin, ledgerScope)

  let result: Awaited<ReturnType<typeof backfillTurnkeyOnchainTransactions>> | null = null
  if (txBackfillEnabled()) {
    result = await backfillTurnkeyOnchainTransactions(admin, {
      walletOwnerId,
      signaturesPerAddress: 25,
      throttleMsBetweenIngests: 120,
    })
  }

  return { balanceSync, noahReconcile, result, txBackfillEnabled: txBackfillEnabled() }
}

/**
 * POST — align `wallet_balances` with on-chain ATA and reconcile Noah bank on-ramp credits.
 *
 * Optional RPC transaction backfill when `SYNC_CHAIN_LEDGER_TX_BACKFILL=1` (admin/support only).
 * Organic stablecoin deposits are ingested via Turnkey balance webhooks, not this route.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const admin = createSupabaseAdmin()
  const walletOwnerId = await resolveWalletOwnerIdForEasnerContext(admin, acc.ctx)
  if (!walletOwnerId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_wallet_owner" })
  }

  const ledgerScope = {
    userId: acc.ctx.subjectUserId,
    businessId: acc.ctx.subjectBusinessId,
  }

  const now = Date.now()
  const lastAt = lastSyncAtByOwner.get(walletOwnerId) ?? 0
  if (now - lastAt < MIN_SYNC_INTERVAL_MS) {
    const payload = await runOwnerLedgerSync(admin, walletOwnerId, ledgerScope)
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "cooldown",
      retryAfterMs: Math.max(MIN_SYNC_INTERVAL_MS - (now - lastAt), 0),
      ...payload,
    })
  }

  const inFlight = inFlightByOwner.get(walletOwnerId)
  if (inFlight) {
    try {
      const awaited = await inFlight
      return NextResponse.json({ ok: true, deduped: true, ...(awaited as object) })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ ok: false, deduped: true, error: msg }, { status: 500 })
    }
  }

  try {
    const run = runOwnerLedgerSync(admin, walletOwnerId, ledgerScope)
    inFlightByOwner.set(walletOwnerId, run)
    const payload = await run
    lastSyncAtByOwner.set(walletOwnerId, Date.now())
    return NextResponse.json({ ok: true, ...payload })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    inFlightByOwner.delete(walletOwnerId)
  }
}
