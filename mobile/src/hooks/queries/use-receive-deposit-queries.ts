import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { PersonalScope } from '@easner/shared'
import { qk } from '@easner/shared'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'

/** Noah `/api/noah/virtual-accounts` JSON — aligned with business `VaJson`. */
export type NoahVirtualAccountDisplayJson = {
  hasAccount?: boolean
  currency?: string
  accountNumber?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  bic?: string
  bankName?: string
  bankAddress?: string
  accountHolderName?: string
  status?: string
}

export type TurnkeyDepositLineJson = {
  address: string
  ownerAddress: string
  stablecoin: string
  chain: string
  memo: string
}

export type TurnkeyDepositAddressesJson = {
  USD: TurnkeyDepositLineJson
  EUR: TurnkeyDepositLineJson
}

/** Same currency list as business VA rows; keys must match `qk.wallets.virtualAccounts(scope, sorted)`. */
export const RECEIVE_VA_CURRENCIES = ['USD', 'EUR'] as const

/**
 * Slightly shorter than business VA (5m) so Home prefetch + navigation stays fresher without hammering API.
 * While data is *fresh*, React Query will not refetch on its own; updates still land via
 * `invalidateQueries(qk.wallets.root(scope))` (foreground resume, PIN unlock, create-accounts, etc.).
 * After this window, a returning observer may trigger a background refetch so late server/DB changes
 * are picked up even without a dedicated Supabase listener on this screen.
 */
export const RECEIVE_DEPOSIT_STALE_MS = 3 * 60_000

/**
 * Inactive query data is kept for a long window because receive instructions are stable account
 * artifacts. The persisted cache is cleared on sign-out/account switch, and stale data still
 * refreshes in the background after login/resume, so returning users should not see a blank
 * account/address table just because these rarely-changing details aged out locally.
 */
export const RECEIVE_DEPOSIT_GC_MS = 365 * 24 * 60 * 60_000

const RECEIVE_QUERY_META = {
  safePersist: true,
  freshness: 'operational' as const,
}

async function fetchConsumerVirtualAccountsMap(): Promise<
  Record<string, NoahVirtualAccountDisplayJson | null>
> {
  const currencies = RECEIVE_VA_CURRENCIES.map((c) => c.toLowerCase()).join(',')
  const data = await apiFetch<{ accounts?: Record<string, NoahVirtualAccountDisplayJson | null> }>(
    `/api/noah/virtual-accounts`,
    {
      query: { currencies },
      headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
    },
  )
  const accounts = data.accounts ?? {}
  const out: Record<string, NoahVirtualAccountDisplayJson | null> = {}
  for (const code of RECEIVE_VA_CURRENCIES) {
    out[code] = accounts[code] ?? accounts[code.toLowerCase()] ?? null
  }
  return out
}

async function fetchConsumerDepositAddresses(): Promise<TurnkeyDepositAddressesJson> {
  return apiFetch<TurnkeyDepositAddressesJson>(`/api/wallets/deposit-addresses`, {
    query: { mode: 'fast' },
    headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
  })
}

/**
 * Warm Receive Money caches while the user is on Home so the first open of Receive is instant when possible.
 * Safe to call on every focus: TanStack skips network when data is still within `staleTime`.
 */
export function prefetchReceiveDepositQueries(
  qc: QueryClient,
  scope: PersonalScope | null | undefined,
): Promise<void> {
  if (!scope) return Promise.resolve()

  return Promise.all([
    qc.prefetchQuery({
      queryKey: qk.wallets.virtualAccounts(scope, [...RECEIVE_VA_CURRENCIES]),
      queryFn: fetchConsumerVirtualAccountsMap,
      staleTime: RECEIVE_DEPOSIT_STALE_MS,
      gcTime: RECEIVE_DEPOSIT_GC_MS,
      meta: RECEIVE_QUERY_META,
    }),
    qc.prefetchQuery({
      queryKey: qk.wallets.depositAddresses(scope),
      queryFn: fetchConsumerDepositAddresses,
      staleTime: RECEIVE_DEPOSIT_STALE_MS,
      gcTime: RECEIVE_DEPOSIT_GC_MS,
      meta: RECEIVE_QUERY_META,
    }),
  ]).then(() => undefined)
}

/**
 * Personal-scope virtual accounts (USD/EUR) for Receive — same API and key family as
 * `business/hooks/use-business-account-rows` so `invalidateQueries(qk.wallets.root(scope))`
 * refreshes this together with balances.
 */
export function useConsumerVirtualAccounts() {
  const { scope, isReady } = useScope()
  return useQuery({
    queryKey: scope
      ? qk.wallets.virtualAccounts(scope, [...RECEIVE_VA_CURRENCIES])
      : (['wallets', 'virtual-accounts', 'disabled'] as const),
    enabled: Boolean(scope) && isReady,
    queryFn: fetchConsumerVirtualAccountsMap,
    staleTime: RECEIVE_DEPOSIT_STALE_MS,
    gcTime: RECEIVE_DEPOSIT_GC_MS,
    meta: RECEIVE_QUERY_META,
  })
}

/**
 * Turnkey USDC / EURC deposit lines — same route as `noahService.getTurnkeyDepositAddresses`.
 */
export function useConsumerDepositAddresses() {
  const { scope, isReady } = useScope()
  return useQuery({
    queryKey: scope ? qk.wallets.depositAddresses(scope) : (['wallets', 'deposit-addresses', 'disabled'] as const),
    enabled: Boolean(scope) && isReady,
    queryFn: fetchConsumerDepositAddresses,
    staleTime: RECEIVE_DEPOSIT_STALE_MS,
    gcTime: RECEIVE_DEPOSIT_GC_MS,
    meta: RECEIVE_QUERY_META,
  })
}
