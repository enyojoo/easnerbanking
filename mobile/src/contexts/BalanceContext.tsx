import React, { createContext, useContext, useCallback, useMemo, ReactNode, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import { useWalletBalances } from '../hooks/queries/use-wallets'
import { isDefinitiveEmptyBalanceResponse } from '../lib/wallet-balance-display'
import { useMaybeScope } from '../query/scope'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Compatibility shim over the TanStack Query `useWalletBalances` hook.
 *
 * The BalanceContext surface is kept intact — existing screens still call
 * `useBalance()` and receive `{ balances, hasResolvedBalance, hasAuthoritativeBalance, refreshBalances, ... }`
 * — but the data now lives in the shared Query cache. Realtime balance events
 * flow through `useSupabaseRealtimeScope` (mounted once in `QueryProvider`)
 * and surgically update `qk.wallets.list(scope)`, so this context no longer
 * owns a Supabase channel, AsyncStorage envelope, or polling loop.
 *
 * Balances are sensitive → NEVER persisted to disk (see `useWalletBalances`
 * `meta.safePersist: false`). Cold-start continuity comes from the in-memory
 * query cache once auth is ready, not from persisting raw balances to disk.
 *
 * Optimistic updates remain available for the send flow so the UI stays
 * instant, but they write to the in-memory Query cache (via
 * `setQueryData`) rather than parallel state. The next realtime event or
 * refetch overwrites the optimistic value with server truth.
 */

interface Balances {
  USD: string
  EUR: string
}

interface BalanceContextType {
  balances: Balances
  /** True once we have query data or a disk snapshot read completed (legacy UX flag). */
  hasResolvedBalance: boolean
  /** True when the latest wallet query returned an authoritative on-chain/DB balance (`source !== 'none'`). */
  hasAuthoritativeBalance: boolean
  /**
   * True when the server returned a settled empty-wallet response (`source: "none"` with a
   * non-transient detail such as `no_wallet_owner`). UI can show $0.00 without waiting for Turnkey.
   */
  hasDefinitiveEmptyBalance: boolean
  refreshBalances: (force?: boolean) => Promise<void>
  updateBalanceOptimistically: (
    currency: 'USD' | 'EUR',
    amount: number,
    operation?: 'subtract' | 'add',
    transactionId?: string,
  ) => void
}

const BalanceContext = createContext<BalanceContextType | undefined>(undefined)

const EMPTY_BALANCES: Balances = { USD: '0', EUR: '0' }
const BALANCE_SNAPSHOT_KEY_PREFIX = 'easner_wallet_balances_snapshot_v1_'

export function useBalance() {
  const ctx = useContext(BalanceContext)
  if (!ctx) throw new Error('useBalance must be used within a BalanceProvider')
  return ctx
}

interface BalanceProviderProps {
  children: ReactNode
}

export function BalanceProvider({ children }: BalanceProviderProps) {
  const qc = useQueryClient()
  const scope = useMaybeScope()
  const query = useWalletBalances()
  const lastKnownBalancesRef = useRef<Balances>(EMPTY_BALANCES)
  const [hydratedFromDisk, setHydratedFromDisk] = useState(false)
  const isAuthoritativeBalanceRead = Boolean(query.data && query.data.source !== 'none')
  const hasDefinitiveEmptyBalance = isDefinitiveEmptyBalanceResponse(
    query.data?.source,
    query.data?.detail,
  )

  // Hydrate last-known authoritative snapshot for instant cold-start UX.
  useEffect(() => {
    if (!scope) return
    let cancelled = false
    const key = `${BALANCE_SNAPSHOT_KEY_PREFIX}${scope.kind === 'business' ? scope.orgId : scope.userId}`
    void AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled) return
        if (!raw) return
        const parsed = JSON.parse(raw) as { USD?: string; EUR?: string; ts?: number }
        const next: Balances = {
          USD: typeof parsed?.USD === 'string' ? parsed.USD : '0',
          EUR: typeof parsed?.EUR === 'string' ? parsed.EUR : '0',
        }
        // Only accept if at least one currency is present (avoid overwriting defaults with junk).
        if (next.USD.trim().length > 0 || next.EUR.trim().length > 0) {
          lastKnownBalancesRef.current = next
        }
      })
      .catch(() => {
        // ignore
      })
      .finally(() => {
        if (!cancelled) setHydratedFromDisk(true)
      })
    return () => {
      cancelled = true
    }
  }, [scope])

  useEffect(() => {
    if (!query.data) return
    if (!isAuthoritativeBalanceRead) return
    const next: Balances = {
      USD: String(query.data.USD ?? '0'),
      EUR: String(query.data.EUR ?? '0'),
    }
    lastKnownBalancesRef.current = next
    if (!scope) return
    const key = `${BALANCE_SNAPSHOT_KEY_PREFIX}${scope.kind === 'business' ? scope.orgId : scope.userId}`
    AsyncStorage.setItem(key, JSON.stringify({ ...next, ts: Date.now() })).catch(() => {
      // ignore
    })
  }, [isAuthoritativeBalanceRead, query.data])

  const balances: Balances = useMemo(() => {
    if (!query.data) return lastKnownBalancesRef.current
    if (!isAuthoritativeBalanceRead) return lastKnownBalancesRef.current
    return {
      USD: String(query.data.USD ?? '0'),
      EUR: String(query.data.EUR ?? '0'),
    }
  }, [isAuthoritativeBalanceRead, query.data])

  const hasResolvedBalance = Boolean(query.data) || hydratedFromDisk

  const refreshBalances = useCallback(
    async (force: boolean = false) => {
      if (!scope) return
      if (force) {
        // Prefix matches `qk.wallets.list` and any wallet sub-keys (same as foreground resume).
        await qc.invalidateQueries({ queryKey: qk.wallets.root(scope) })
        return
      }
      await query.refetch()
    },
    [qc, scope, query],
  )

  const updateBalanceOptimistically = useCallback<BalanceContextType['updateBalanceOptimistically']>(
    (currency, amount, operation = 'subtract') => {
      if (!scope) return
      const key = qk.wallets.list(scope)
      qc.setQueryData(key, (prev: unknown) => {
        const base =
          prev && typeof prev === 'object'
            ? (prev as Record<string, unknown>)
            : {}
        const currentRaw = (base as Record<string, unknown>)[currency]
        const current = Number.parseFloat(String(currentRaw ?? '0')) || 0
        const updated =
          operation === 'subtract'
            ? Math.max(0, current - amount)
            : current + amount
        return { ...base, [currency]: updated.toFixed(2) }
      })
      // Kick off a background refetch so the optimistic value is replaced
      // with authoritative server state within a few seconds. The realtime
      // bridge will also poke us independently if the channel is healthy.
      qc.invalidateQueries({ queryKey: qk.wallets.root(scope) })
    },
    [qc, scope],
  )

  const value = useMemo<BalanceContextType>(
    () => ({
      balances,
      hasResolvedBalance,
      hasAuthoritativeBalance: isAuthoritativeBalanceRead,
      hasDefinitiveEmptyBalance,
      refreshBalances,
      updateBalanceOptimistically,
    }),
    [
      balances,
      hasResolvedBalance,
      isAuthoritativeBalanceRead,
      hasDefinitiveEmptyBalance,
      refreshBalances,
      updateBalanceOptimistically,
    ],
  )

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>
}
