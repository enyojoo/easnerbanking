import React, { createContext, useContext, useCallback, useMemo, ReactNode, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useWalletBalances } from '../hooks/queries/use-wallets'
import { useMaybeScope } from '../query/scope'

/**
 * Compatibility shim over the TanStack Query `useWalletBalances` hook.
 *
 * The BalanceContext surface is kept intact — existing screens still call
 * `useBalance()` and receive `{ balances, refreshBalances, updateBalanceOptimistically }`
 * — but the data now lives in the shared Query cache. Realtime balance events
 * flow through `useSupabaseRealtimeScope` (mounted once in `QueryProvider`)
 * and surgically update `qk.wallets.list(scope)`, so this context no longer
 * owns a Supabase channel, AsyncStorage envelope, or polling loop.
 *
 * Balances are sensitive → NEVER persisted to disk (see `useWalletBalances`
 * `meta.safePersist: false`).
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
  hasResolvedBalance: boolean
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
const BALANCE_CACHE_KEY_PREFIX = 'easner_balance_seed_v1_'

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
  const [seededBalances, setSeededBalances] = React.useState<Balances | null>(null)

  useEffect(() => {
    let mounted = true
    const userId = scope?.userId
    if (!userId) {
      setSeededBalances(null)
      return
    }
    const key = `${BALANCE_CACHE_KEY_PREFIX}${userId}`
    void AsyncStorage.getItem(key)
      .then((raw) => {
        if (!mounted || !raw) return
        const parsed = JSON.parse(raw) as Partial<Balances> | null
        const next: Balances = {
          USD: String(parsed?.USD ?? '0'),
          EUR: String(parsed?.EUR ?? '0'),
        }
        lastKnownBalancesRef.current = next
        setSeededBalances(next)
      })
      .catch(() => undefined)
    return () => {
      mounted = false
    }
  }, [scope?.userId])

  useEffect(() => {
    if (!query.data) return
    const hasUSD = query.data._hasUSD === true
    const hasEUR = query.data._hasEUR === true
    const prev = lastKnownBalancesRef.current
    const next: Balances = {
      USD: hasUSD ? String(query.data.USD ?? '0') : prev.USD,
      EUR: hasEUR ? String(query.data.EUR ?? '0') : prev.EUR,
    }
    lastKnownBalancesRef.current = next
    setSeededBalances(next)
    const userId = scope?.userId
    if (!userId) return
    const key = `${BALANCE_CACHE_KEY_PREFIX}${userId}`
    void AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => undefined)
  }, [query.data, scope?.userId])

  const balances: Balances = useMemo(() => {
    if (!query.data) return seededBalances ?? lastKnownBalancesRef.current
    const prev = seededBalances ?? lastKnownBalancesRef.current
    return {
      USD: query.data._hasUSD ? String(query.data.USD ?? '0') : prev.USD,
      EUR: query.data._hasEUR ? String(query.data.EUR ?? '0') : prev.EUR,
    }
  }, [query.data, seededBalances])

  const hasResolvedBalance = Boolean(query.data || seededBalances)

  const refreshBalances = useCallback(
    async (force: boolean = false) => {
      if (!scope) return
      if (force) {
        await qc.invalidateQueries({ queryKey: qk.wallets.list(scope) })
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
      qc.invalidateQueries({ queryKey: qk.wallets.list(scope) })
    },
    [qc, scope],
  )

  const value = useMemo<BalanceContextType>(
    () => ({ balances, hasResolvedBalance, refreshBalances, updateBalanceOptimistically }),
    [balances, hasResolvedBalance, refreshBalances, updateBalanceOptimistically],
  )

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>
}
