import { markRecentMoneyActivity, qk, type PersonalScope } from '@easner/shared'
import { bustFinancialFeedCaches } from '../lib/userCache'
import { getMobileQueryClient } from './client'

export function isMoneyMovementPush(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false
  const event = String(data.event_type ?? data.eventType ?? '').toLowerCase()
  if (event.includes('transaction')) return true
  if (data.transaction_id != null || data.transactionId != null) return true
  return false
}

/** Invalidate wallet + transaction caches after balance/ledger changes (push, etc.). */
export async function refreshMoneyFeedsForUser(userId: string): Promise<void> {
  if (!userId.trim()) return
  const scope: PersonalScope = { kind: 'personal', userId: userId.trim() }
  const qc = getMobileQueryClient()
  markRecentMoneyActivity()
  await bustFinancialFeedCaches(userId).catch(() => undefined)
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.wallets.root(scope), refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: 'active' }),
  ])
}
