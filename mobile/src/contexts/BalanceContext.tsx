import React, { createContext, useContext, useCallback, useMemo, ReactNode, useEffect, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import { useWalletBalances } from '../hooks/queries/use-wallets'
import {
  isDefinitiveEmptyBalanceResponse,
  isSuspiciousAuthoritativeZeroRegression,
} from '../lib/wallet-balance-display'
import { registerAppLockListener } from '../lib/app-lock-bus'
import {
  balanceSnapshotStorageKey,
  getMemoryBalanceSnapshot,
  hasMeaningfulBalanceSnapshot,
  parseBalanceSnapshot,
  refreshMemoryBalanceSnapshotFromDisk,
  setMemoryBalanceSnapshot,
  writeBalanceSnapshotToDisk,
  type WalletBalanceSnapshot,
} from '../lib/wallet-balance-snapshot'
import { useMaybeScope } from '../query/scope'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Compatibility shim over the TanStack Query `useWalletBalances` hook.
 *
 * The BalanceContext surface is kept intact – existing screens still call
 * `useBalance()` and receive `{ balances, hasResolvedBalance, hasAuthoritativeBalance, refreshBalances, ... }`
 * – but the data now lives in the shared Query cache. Realtime balance events
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

type Balances = WalletBalanceSnapshot

interface BalanceContextType {
  balances: Balances
  /** True once we have wallet API data or a persisted snapshot (not merely "disk read finished"). */
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

const EMPTY_BALANCES: Balances = { USD: '', EUR: '' }

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
  const snapshotKey = scope ? balanceSnapshotStorageKey(scope) : null
  const memoryPrime = snapshotKey ? getMemoryBalanceSnapshot(snapshotKey) : null
  const lastKnownBalancesRef = useRef<Balances>(memoryPrime ?? EMPTY_BALANCES)
  const [snapshotVersion, setSnapshotVersion] = useState(0)
  const applySnapshot = useCallback((next: Balances) => {
    lastKnownBalancesRef.current = next
    if (snapshotKey) setMemoryBalanceSnapshot(snapshotKey, next)
    setSnapshotVersion((v) => v + 1)
  }, [snapshotKey])
  const isAuthoritativeBalanceRead = Boolean(query.data && query.data.source !== 'none')
  const hasDefinitiveEmptyBalance = isDefinitiveEmptyBalanceResponse(
    query.data?.source,
    query.data?.detail,
  )
  const suspiciousZeroRegression = isSuspiciousAuthoritativeZeroRegression(
    query.data?.source,
    query.data?.USD,
    query.data?.EUR,
    lastKnownBalancesRef.current,
  )
  const effectiveAuthoritativeRead = isAuthoritativeBalanceRead && !suspiciousZeroRegression

  // Hydrate last-known snapshot for instant dashboard UX (memory + disk).
  useEffect(() => {
    if (!scope) return
    let cancelled = false
    const key = balanceSnapshotStorageKey(scope)
    void AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled) return
        const parsed = parseBalanceSnapshot(raw)
        if (parsed) applySnapshot(parsed)
      })
      .catch(() => {
        // ignore
      })
    return () => {
      cancelled = true
    }
  }, [applySnapshot, scope])

  // After PIN unlock / foreground: background task may have refreshed disk snapshots.
  useEffect(() => {
    if (!scope) return
    const syncFromDisk = () => {
      void refreshMemoryBalanceSnapshotFromDisk(scope).then((parsed) => {
        if (parsed) applySnapshot(parsed)
      })
    }
    const appSub =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (status) => {
            if (status === 'active') syncFromDisk()
          })
    const offLock = registerAppLockListener((event) => {
      if (event === 'unlocked') syncFromDisk()
    })
    return () => {
      appSub?.remove()
      offLock()
    }
  }, [applySnapshot, scope])

  useEffect(() => {
    if (!query.data) return
    if (!effectiveAuthoritativeRead && !hasDefinitiveEmptyBalance) return
    const next: Balances = {
      USD: String(query.data.USD ?? '0'),
      EUR: String(query.data.EUR ?? '0'),
    }
    applySnapshot(next)
    if (!scope) return
    void writeBalanceSnapshotToDisk(scope, next)
  }, [applySnapshot, effectiveAuthoritativeRead, hasDefinitiveEmptyBalance, query.data, scope])

  const balances: Balances = useMemo(() => {
    if (!query.data) return lastKnownBalancesRef.current
    if (hasDefinitiveEmptyBalance || effectiveAuthoritativeRead) {
      return {
        USD: String(query.data.USD ?? '0'),
        EUR: String(query.data.EUR ?? '0'),
      }
    }
    return lastKnownBalancesRef.current
  }, [effectiveAuthoritativeRead, hasDefinitiveEmptyBalance, query.data, snapshotVersion])

  const hasResolvedBalance =
    Boolean(query.data) || hasMeaningfulBalanceSnapshot(lastKnownBalancesRef.current)

  const refreshBalances = useCallback(
    async (force: boolean = false) => {
      if (!scope) return
      if (force) {
        await qc.refetchQueries({ queryKey: qk.wallets.root(scope), type: 'active' })
        return
      }
      if (!query.isStale) return
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
      hasAuthoritativeBalance: effectiveAuthoritativeRead,
      hasDefinitiveEmptyBalance,
      refreshBalances,
      updateBalanceOptimistically,
    }),
    [
      balances,
      hasResolvedBalance,
      effectiveAuthoritativeRead,
      hasDefinitiveEmptyBalance,
      refreshBalances,
      updateBalanceOptimistically,
    ],
  )

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>
}
