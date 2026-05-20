import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { reconcileNoahBankOnrampCreditsForOwner } from "@/lib/noah/credit-bank-onramp-wallet"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { backfillTurnkeyOnchainTransactions } from "@/lib/turnkey/onchain-backfill"
import { syncOrganicInboundDepositsForOwner } from "@/lib/turnkey/sync-organic-inbound-deposits"
import { syncWalletBalancesFromSolanaAtaForOwner } from "@/lib/wallet/sync-wallet-balances-from-ata"

export const runtime = "nodejs"

const MIN_SYNC_INTERVAL_MS = 10 * 60_000
const FULL_SCAN_SIGNATURES = 25
const COOLDOWN_SCAN_SIGNATURES = 12

const lastSyncAtByOwner = new Map<string, number>()
const inFlightByOwner = new Map<string, Promise<unknown>>()

function heavyBackfillEnabled(): boolean {
  return process.env.SYNC_CHAIN_LEDGER_TX_BACKFILL === "1" || process.env.SYNC_CHAIN_LEDGER_TX_BACKFILL === "true"
}

async function runOwnerLedgerSync(
  admin: ReturnType<typeof createSupabaseAdmin>,
  walletOwnerId: string,
  ledgerScope: { userId: string; businessId: string | null },
  opts: { signaturesPerAddress: number; throttleMs: number },
) {
  const balanceSync = await syncWalletBalancesFromSolanaAtaForOwner(admin, walletOwnerId)
  const noahReconcile = await reconcileNoahBankOnrampCreditsForOwner(admin, ledgerScope)

  // Organic deposits: RPC ingest (Noah/Easetag suppressed). Turnkey balance webhooks are optional enhancement.
  const [result, organicInbound] = await Promise.all([
    backfillTurnkeyOnchainTransactions(admin, {
      walletOwnerId,
      signaturesPerAddress: opts.signaturesPerAddress,
      throttleMsBetweenIngests: opts.throttleMs,
    }),
    syncOrganicInboundDepositsForOwner(admin, {
      walletOwnerId,
      signaturesPerAta: Math.max(opts.signaturesPerAddress, 35),
      throttleMs: opts.throttleMs,
    }),
  ])

  return {
    balanceSync,
    noahReconcile,
    result,
    organicInbound,
    signaturesPerAddress: opts.signaturesPerAddress,
    heavyBackfill: heavyBackfillEnabled(),
  }
}

/**
 * POST — ATA balance snapshot, Noah credit reconcile, and inbound Solana deposit ingest.
 *
 * Turnkey `BALANCE_CONFIRMED` webhooks are optional; this route is the product fallback until they fire.
 * `SYNC_CHAIN_LEDGER_TX_BACKFILL=1` only affects throttle/signature limits (full repair mode).
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

  const heavy = heavyBackfillEnabled()
  const scanOpts = heavy
    ? { signaturesPerAddress: 120, throttleMs: 40 }
    : { signaturesPerAddress: FULL_SCAN_SIGNATURES, throttleMs: 120 }

  const now = Date.now()
  const lastAt = lastSyncAtByOwner.get(walletOwnerId) ?? 0
  const onCooldown = now - lastAt < MIN_SYNC_INTERVAL_MS

  if (onCooldown) {
    const payload = await runOwnerLedgerSync(admin, walletOwnerId, ledgerScope, {
      signaturesPerAddress: COOLDOWN_SCAN_SIGNATURES,
      throttleMs: 150,
    })
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
    const run = runOwnerLedgerSync(admin, walletOwnerId, ledgerScope, scanOpts)
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
