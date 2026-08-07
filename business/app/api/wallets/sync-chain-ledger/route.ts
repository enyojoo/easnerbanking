import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import {
  linkNoahOrchestrationOutHashesForOwner,
  reconcileNoahBankOnrampCreditsForOwner,
} from "@/lib/noah/credit-bank-onramp-wallet"
import { reconcileRelayDepositsForOwner } from "@/lib/relay-deposit/settle-relay-deposit"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { createSolanaRpcConnection } from "@/lib/solana/rpc-connection"
import { syncWalletBalancesFromSolanaAtaForOwner } from "@/lib/wallet/sync-wallet-balances-from-ata"
import { backfillTurnkeyOnchainTransactions } from "@/lib/turnkey/onchain-backfill"
import { isTurnkeyBalanceWebhooksIngestEnabled } from "@/lib/turnkey/config"
import { syncOrganicInboundDepositsForOwner } from "@/lib/turnkey/sync-organic-inbound-deposits"

export const runtime = "nodejs"

const MIN_FULL_SCAN_INTERVAL_MS = 10 * 60_000

const lastFullScanAtByOwner = new Map<string, number>()
const inFlightByOwner = new Map<string, Promise<unknown>>()

function heavyBackfillEnabled(): boolean {
  return process.env.SYNC_CHAIN_LEDGER_TX_BACKFILL === "1" || process.env.SYNC_CHAIN_LEDGER_TX_BACKFILL === "true"
}

type SyncMode = "cooldown" | "full" | "heavy"

async function runOwnerLedgerSync(
  admin: ReturnType<typeof createSupabaseAdmin>,
  walletOwnerId: string,
  ledgerScope: { userId: string; businessId: string | null },
  mode: SyncMode,
) {
  const connection = createSolanaRpcConnection()
  const balanceSync = await syncWalletBalancesFromSolanaAtaForOwner(admin, walletOwnerId, connection)
  const noahHashPrime = await linkNoahOrchestrationOutHashesForOwner(admin, ledgerScope)
  const noahReconcile = await reconcileNoahBankOnrampCreditsForOwner(admin, ledgerScope)
  const relayReconcile = await reconcileRelayDepositsForOwner(admin, ledgerScope)

  if (mode === "cooldown") {
    return {
      balanceSync,
      noahHashPrime,
      noahReconcile,
      relayReconcile,
      chainIngest: { skipped: true, reason: "cooldown_rpc_conservation" },
      result: null,
      organicInbound: null,
    }
  }

  if (mode === "heavy") {
    const result = await backfillTurnkeyOnchainTransactions(admin, {
      walletOwnerId,
      connection,
      signaturesPerAddress: 40,
      throttleMsBetweenIngests: 200,
      scanOwnerAddress: false,
    })
    return {
      balanceSync,
      noahHashPrime,
      noahReconcile,
      relayReconcile,
      result,
      organicInbound: null,
      chainIngest: { mode: "heavy" },
    }
  }

  if (isTurnkeyBalanceWebhooksIngestEnabled()) {
    return {
      balanceSync,
      noahHashPrime,
      noahReconcile,
      relayReconcile,
      result: null,
      organicInbound: { skipped: true, reason: "balance_webhooks_primary" },
      chainIngest: { mode: "organic_ata_skipped" },
    }
  }

  const organicInbound = await syncOrganicInboundDepositsForOwner(admin, {
    walletOwnerId,
    connection,
    signaturesPerAta: 8,
    throttleMs: 280,
    maxParsePerAccount: 5,
    maxIngestPerRun: 4,
  })

  return {
    balanceSync,
    noahHashPrime,
    noahReconcile,
    relayReconcile,
    result: null,
    organicInbound,
    chainIngest: { mode: "organic_ata" },
  }
}

/**
 * POST — ATA balance snapshot, Noah credit reconcile, and (on full scan) lightweight inbound ingest.
 *
 * Cooldown calls only refresh balances + Noah credits (no Solana tx parse) to avoid RPC 429s.
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
  const lastFull = lastFullScanAtByOwner.get(walletOwnerId) ?? 0
  const onCooldown = now - lastFull < MIN_FULL_SCAN_INTERVAL_MS && !heavyBackfillEnabled()

  const mode: SyncMode = heavyBackfillEnabled() ? "heavy" : onCooldown ? "cooldown" : "full"

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
    const run = runOwnerLedgerSync(admin, walletOwnerId, ledgerScope, mode)
    inFlightByOwner.set(walletOwnerId, run)
    const payload = await run
    if (mode === "full" || mode === "heavy") {
      lastFullScanAtByOwner.set(walletOwnerId, Date.now())
    }
    return NextResponse.json({
      ok: true,
      mode,
      ...(onCooldown ? { skipped: true, reason: "cooldown", retryAfterMs: Math.max(MIN_FULL_SCAN_INTERVAL_MS - (now - lastFull), 0) } : {}),
      ...payload,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    inFlightByOwner.delete(walletOwnerId)
  }
}
