import { markRecentMoneyActivity, qk, type PersonalScope } from '@easner/shared'
import { bustFinancialFeedCaches } from '../lib/userCache'
import { prefetchReceiveDepositQueries } from '../hooks/queries/use-receive-deposit-queries'
import { refreshSendDestinations } from '../lib/sendDestinations'
import { warmOperationalRecipientCaches } from '../lib/warmOperationalRecipientCaches'
import { getMobileQueryClient } from './client'

export function isMoneyMovementPush(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false
  const event = String(data.event_type ?? data.eventType ?? '').toLowerCase()
  if (event.includes('transaction')) return true
  if (data.transaction_id != null || data.transactionId != null) return true
  return false
}

export type RefreshLiveOperationalDataOpts = {
  /** When true, await active query refetches (legacy push refresh behavior). */
  awaitActive?: boolean
}

/**
 * Invalidate + refetch all live operational feeds after money movement or resume.
 * Non-blocking by default – callers opening TransactionDetails should not await this.
 */
export async function refreshLiveOperationalData(
  scope: PersonalScope,
  opts?: RefreshLiveOperationalDataOpts,
): Promise<void> {
  const qc = getMobileQueryClient()
  markRecentMoneyActivity()
  await bustFinancialFeedCaches(scope.userId).catch(() => undefined)

  const invalidations = [
    qc.invalidateQueries({ queryKey: qk.wallets.root(scope), refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: qk.notifications.root(scope.userId), refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: qk.notifications.unread(scope.userId), refetchType: 'active' }),
  ]

  if (opts?.awaitActive) {
    await Promise.all(invalidations)
  } else {
    void Promise.all(invalidations)
  }

  void prefetchReceiveDepositQueries(qc, scope)
  // Payout corridor catalog (bank/MoMo enums, fields_schema) – office can change without app release.
  void refreshSendDestinations().catch(() => undefined)
  void warmOperationalRecipientCaches(qc, scope).catch(() => undefined)
}

/** Invalidate wallet + transaction caches after balance/ledger changes (push, etc.). */
export async function refreshMoneyFeedsForUser(userId: string): Promise<void> {
  if (!userId.trim()) return
  const scope: PersonalScope = { kind: 'personal', userId: userId.trim() }
  await refreshLiveOperationalData(scope, { awaitActive: true })
}
