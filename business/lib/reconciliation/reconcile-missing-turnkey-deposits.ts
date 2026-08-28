import type { SupabaseClient } from "@supabase/supabase-js"
import { applyTurnkeyBalanceWebhookSideEffects } from "@/lib/turnkey/balance-webhook-sync"
import { inboundHashHasVisibleLedgerCredit } from "@/lib/turnkey/inbound-hash-visible-ledger"
import { parseTurnkeyBalanceWebhookPayload } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"

export type ReconcileMissingTurnkeyDepositRow = {
  eventId: string
  txHash: string
  amount: number
  address: string
  status: string
  action: "missing_ledger" | "has_ledger" | "skipped"
  error?: string
}

export async function reconcileMissingTurnkeyDeposits(
  admin: SupabaseClient,
  opts: { sinceDays: number; limit: number; dryRun: boolean },
): Promise<{ scanned: number; missing: number; repaired: number; failed: number; rows: ReconcileMissingTurnkeyDepositRow[] }> {
  const since = new Date(Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: inboxRows, error } = await admin
    .from("event_inbox")
    .select("event_id, payload, status")
    .eq("provider", "turnkey")
    .in("status", ["processed", "failed"])
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(opts.limit)

  if (error) throw error

  const rows: ReconcileMissingTurnkeyDepositRow[] = []
  let missing = 0
  let repaired = 0
  let failed = 0

  for (const row of inboxRows ?? []) {
    const eventId = String(row.event_id || "")
    const parsed = parseTurnkeyBalanceWebhookPayload(row.payload)
    if (parsed.kind !== "deposit" || !parsed.data.txHash) {
      continue
    }

    const deposit = parsed.data
    const scope = await resolveTurnkeyWalletScopeFromEvent(admin, {
      ...deposit.raw,
      address: deposit.address,
      txHash: deposit.txHash,
      asset: deposit.asset,
      msg: {
        address: deposit.address,
        txHash: deposit.txHash,
        operation: "deposit",
        asset: {
          symbol: deposit.asset,
          amount: deposit.amountMinor ?? deposit.amount,
          decimals: deposit.decimals,
        },
      },
    })
    if (!scope) {
      rows.push({
        eventId,
        txHash: deposit.txHash,
        amount: deposit.amount,
        address: deposit.address,
        status: String(row.status),
        action: "skipped",
        error: "scope_unresolved",
      })
      continue
    }

    const visible = await inboundHashHasVisibleLedgerCredit(admin, {
      txHash: deposit.txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    })
    if (visible) {
      rows.push({
        eventId,
        txHash: deposit.txHash,
        amount: deposit.amount,
        address: deposit.address,
        status: String(row.status),
        action: "has_ledger",
      })
      continue
    }

    missing++
    if (opts.dryRun) {
      rows.push({
        eventId,
        txHash: deposit.txHash,
        amount: deposit.amount,
        address: deposit.address,
        status: String(row.status),
        action: "missing_ledger",
      })
      continue
    }

    try {
      await applyTurnkeyBalanceWebhookSideEffects(admin, deposit, eventId)
      repaired++
      rows.push({
        eventId,
        txHash: deposit.txHash,
        amount: deposit.amount,
        address: deposit.address,
        status: String(row.status),
        action: "missing_ledger",
      })
    } catch (e) {
      failed++
      rows.push({
        eventId,
        txHash: deposit.txHash,
        amount: deposit.amount,
        address: deposit.address,
        status: String(row.status),
        action: "missing_ledger",
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return {
    scanned: inboxRows?.length ?? 0,
    missing,
    repaired,
    failed,
    rows,
  }
}
