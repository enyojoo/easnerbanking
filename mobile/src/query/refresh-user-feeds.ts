import type { QueryClient } from '@tanstack/react-query'
import { qk, type Scope } from '@easner/shared'
import { bustFinancialFeedCaches } from '../lib/userCache'

export async function invalidateTransactionsFeed(qc: QueryClient, scope: Scope, userId: string) {
  await bustFinancialFeedCaches(userId)
  await qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: 'active' })
}

export async function invalidateRecipientsFeed(qc: QueryClient, scope: Scope, userId: string) {
  await bustFinancialFeedCaches(userId)
  await qc.invalidateQueries({ queryKey: qk.beneficiaries.root(scope), refetchType: 'active' })
}

/** Focus / pull-to-refresh: revalidate all personal operational caches. */
export async function invalidateAllUserFeeds(qc: QueryClient, scope: Scope, userId: string) {
  await bustFinancialFeedCaches(userId)
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.reference.currencies(), refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['exchange-rates', 'mobile'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: qk.beneficiaries.root(scope), refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['payment-methods', userId], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: qk.settings.communication(userId), refetchType: 'active' }),
  ])
}
