/**
 * When `/api/wallets/on-chain-balances` returns `source: "none"`, some `detail`
 * values mean "we know the balance is zero" (no wallet yet) vs transient Turnkey
 * failures where we should keep loading.
 */
export function isDefinitiveEmptyBalanceResponse(
  source?: string,
  detail?: string,
): boolean {
  if (source !== 'none') return false
  const d = String(detail ?? '').trim()
  if (!d) return false
  if (d === 'turnkey_balance_query_failed' || d.startsWith('turnkey_balance_query_failed:')) {
    return false
  }
  if (
    d === 'warming_cache' ||
    d === 'served_cached_due_to_transient_failure' ||
    d === 'served_cached_due_to_resource_exhausted'
  ) {
    return false
  }
  return true
}
