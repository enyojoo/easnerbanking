import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'
import { useAuth } from './AuthContext'
import type { CommunicationPreferences } from '@easner/shared'
import { parseCommunicationPreferences } from '@easner/shared'
import { Currency, ExchangeRate, Recipient, Transaction, PaymentMethod } from '../types'
import { AppState, AppStateStatus } from 'react-native'
import { supabase } from '../lib/supabase'
import { NOAH_CONTEXT_CURRENCIES } from '../lib/noahStaticData'
import { noahService } from '../lib/noahService'
import { mapNoahListItemToTransaction, buildExchangeRatesFromNoahQuotes } from '../lib/noahUserDataHelpers'
import { recipientService } from '../lib/recipientService'
import { apiGet } from '../lib/apiClient'
import {
  type CachedEnvelope,
  CacheTTL,
  readUserCache,
  writeUserCache,
  removeUserCache,
  isCacheStale,
  buildUserCacheKey,
  clearAllUserCachesForUserId,
  bustFinancialFeedCaches,
  readJsonRaw,
} from '../lib/userCache'

interface UserDataContextType {
  currencies: Currency[]
  exchangeRates: ExchangeRate[]
  recipients: Recipient[]
  transactions: Transaction[]
  paymentMethods: PaymentMethod[]
  communicationPreferences: CommunicationPreferences | null
  communicationPreferencesLoading: boolean
  loading: boolean
  refreshing: boolean // Separate flag for background refresh
  refreshCurrencies: (force?: boolean) => Promise<void>
  refreshExchangeRates: (force?: boolean) => Promise<void>
  refreshRecipients: (force?: boolean) => Promise<void>
  refreshTransactions: (force?: boolean) => Promise<void>
  refreshPaymentMethods: (force?: boolean) => Promise<void>
  refreshCommunicationPreferences: (force?: boolean) => Promise<void>
  commitCommunicationPreferences: (prefs: CommunicationPreferences) => Promise<void>
  refreshAll: (force?: boolean, opts?: { suppressGlobalLoading?: boolean }) => Promise<void>
  refreshStaleData: () => Promise<void> // Refresh only stale data
  invalidateCurrencies: () => Promise<void>
  invalidateExchangeRates: () => Promise<void>
  invalidateRecipients: () => Promise<void>
  invalidateTransactions: () => Promise<void>
  invalidatePaymentMethods: () => Promise<void>
  invalidateAll: () => Promise<void>
  /** Bumps when `transactions` rows change in Supabase (receive, sync, etc.); screens can refetch combined feeds. */
  financialFeedsEpoch: number
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined)

export function useUserData() {
  const context = useContext(UserDataContext)
  if (context === undefined) {
    throw new Error('useUserData must be used within a UserDataProvider')
  }
  return context
}

interface UserDataProviderProps {
  children: ReactNode
}

/** Noah tier guard (403) — normal until KYC/KYB is approved; not an unexpected failure. */
function isNoahVerificationGateError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    msg.includes('Identity verification must be approved') ||
    msg.includes('Business verification must be approved')
  )
}

export function UserDataProvider({ children }: UserDataProviderProps) {
  const { user } = useAuth()
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [communicationPreferences, setCommunicationPreferences] = useState<CommunicationPreferences | null>(null)
  const [communicationPreferencesLoading, setCommunicationPreferencesLoading] = useState(false)
  const [financialFeedsEpoch, setFinancialFeedsEpoch] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false) // Background refresh indicator
  const [dataInitialized, setDataInitialized] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const lastUserIdRef = useRef<string | null>(null)

  // Track last fetch times for stale-while-revalidate
  const lastFetchTimes = useRef<{
    currencies?: number
    exchangeRates?: number
    recipients?: number
    transactions?: number
    paymentMethods?: number
    communicationPreferences?: number
  }>({})

  const fetchCurrencies = async (force: boolean = false, useCache: boolean = true) => {
    const CACHE_KEY = buildUserCacheKey('currencies', user?.id)

    // Try to load from cache first (stale-while-revalidate)
    if (useCache && !force) {
      const cached = await readUserCache<Currency[]>(CACHE_KEY)
      if (cached && !isCacheStale(cached.timestamp, CacheTTL.CURRENCIES)) {
        setCurrencies(cached.data)
        lastFetchTimes.current.currencies = cached.timestamp
        // Data is fresh, no need to fetch
        return
      } else if (cached) {
        // Data is stale, show cached data immediately, then refresh
        setCurrencies(cached.data)
      }
    }

    try {
      const currenciesData = [...NOAH_CONTEXT_CURRENCIES]
      setCurrencies(currenciesData)
      lastFetchTimes.current.currencies = Date.now()
      await writeUserCache(CACHE_KEY, currenciesData)
    } catch (error) {
      console.error('Error fetching currencies:', error)
      // Keep cached data on error
    }
  }

  const fetchExchangeRates = async (force: boolean = false, useCache: boolean = true) => {
    const CACHE_KEY = buildUserCacheKey('exchangeRates', user?.id)

    // Try to load from cache first (stale-while-revalidate)
    if (useCache && !force) {
      const cached = await readUserCache<ExchangeRate[]>(CACHE_KEY)
      if (cached && !isCacheStale(cached.timestamp, CacheTTL.EXCHANGE_RATES)) {
        setExchangeRates(cached.data)
        lastFetchTimes.current.exchangeRates = cached.timestamp
        return
      } else if (cached) {
        setExchangeRates(cached.data)
      }
    }

    try {
      const formattedRates = await buildExchangeRatesFromNoahQuotes((p) => noahService.getFxQuote(p))
      setExchangeRates(formattedRates)
      lastFetchTimes.current.exchangeRates = Date.now()
      await writeUserCache(CACHE_KEY, formattedRates)
    } catch (error) {
      console.error('Error fetching exchange rates:', error)
    }
  }

  const fetchRecipients = async (force: boolean = false, useCache: boolean = true) => {
    if (!user) {
      return
    }

    const CACHE_KEY = buildUserCacheKey('recipients', user.id)

    // Try to load from cache first (stale-while-revalidate)
    if (useCache && !force) {
      const cached = await readUserCache<Recipient[]>(CACHE_KEY)
      if (
        cached &&
        Array.isArray(cached.data) &&
        typeof cached.timestamp === 'number'
      ) {
        const cachedRows = cached.data
        const cachedTs = cached.timestamp
        if (!isCacheStale(cachedTs, CacheTTL.RECIPIENTS)) {
          setRecipients(cachedRows)
          lastFetchTimes.current.recipients = cachedTs
          return
        }
        setRecipients(cachedRows)
      }
    }

    try {
      const recipientsData = await recipientService.getByUserId(user.id)
      const rows = Array.isArray(recipientsData) ? recipientsData : []
      setRecipients(rows)
      lastFetchTimes.current.recipients = Date.now()
      await writeUserCache(CACHE_KEY, rows)
    } catch (error) {
      console.error('Error fetching recipients:', error)
    }
  }

  const fetchTransactions = async (force: boolean = false, useCache: boolean = true) => {
    if (!user) {
      return
    }

    const CACHE_KEY = buildUserCacheKey('contextTransactions', user.id)

    // Try to load from cache first (stale-while-revalidate)
    if (useCache && !force) {
      const cached = await readUserCache<Transaction[]>(CACHE_KEY)
      if (cached && !isCacheStale(cached.timestamp, CacheTTL.CONTEXT_TRANSACTIONS)) {
        setTransactions(cached.data)
        lastFetchTimes.current.transactions = cached.timestamp
        return
      } else if (cached) {
        setTransactions(cached.data)
      }
    }

    try {
      const rows = await noahService.listTransactions(20)
      const transactionsData = rows.map((r) => mapNoahListItemToTransaction(user.id, r))
      setTransactions(transactionsData)
      lastFetchTimes.current.transactions = Date.now()
      await writeUserCache(CACHE_KEY, transactionsData)
    } catch (error: any) {
      // Handle network errors gracefully - don't log as error if it's a network issue
      if (error?.message?.includes('Network request failed') || error?.message?.includes('fetch')) {
        console.warn('UserDataContext: Network error fetching transactions (will retry):', error?.message)
        // Keep existing transactions if network fails
        return
      }
      console.error('Error fetching transactions:', error)
      // On other errors, still set empty array to avoid stale data
      setTransactions([])
    }
  }

  const fetchPaymentMethods = async (force: boolean = false, useCache: boolean = true) => {
    if (!user) return

    const CACHE_KEY = buildUserCacheKey('paymentMethods', user.id)

    // Try to load from cache first (stale-while-revalidate)
    if (useCache && !force) {
      const cached = await readUserCache<PaymentMethod[]>(CACHE_KEY)
      if (cached && !isCacheStale(cached.timestamp, CacheTTL.PAYMENT_METHODS)) {
        setPaymentMethods(cached.data)
        lastFetchTimes.current.paymentMethods = cached.timestamp
        return
      } else if (cached) {
        setPaymentMethods(cached.data)
      }
    }

    try {
      const [usd, eur] = await Promise.all([
        noahService.getVirtualAccount('usd'),
        noahService.getVirtualAccount('eur'),
      ])
      const t = new Date().toISOString()
      const paymentMethodsData: PaymentMethod[] = []
      if (usd?.hasAccount) {
        paymentMethodsData.push({
          id: 'noah-va-usd',
          currency: 'USD',
          type: 'bank_account',
          name: 'USD receiving account',
          account_name: usd.accountHolderName,
          account_number: usd.accountNumber ?? '',
          bank_name: usd.bankName ?? '',
          routing_number: usd.routingNumber,
          iban: usd.iban,
          swift_bic: usd.bic,
          is_default: true,
          status: 'active',
          created_at: t,
          updated_at: t,
        })
      }
      if (eur?.hasAccount) {
        paymentMethodsData.push({
          id: 'noah-va-eur',
          currency: 'EUR',
          type: 'bank_account',
          name: 'EUR receiving account',
          account_name: eur.accountHolderName,
          account_number: eur.accountNumber ?? '',
          bank_name: eur.bankName ?? '',
          routing_number: eur.routingNumber,
          iban: eur.iban,
          swift_bic: eur.bic,
          is_default: !usd?.hasAccount,
          status: 'active',
          created_at: t,
          updated_at: t,
        })
      }
      setPaymentMethods(paymentMethodsData)
      lastFetchTimes.current.paymentMethods = Date.now()
      await writeUserCache(CACHE_KEY, paymentMethodsData)
    } catch (error) {
      if (isNoahVerificationGateError(error)) {
        return
      }
      console.error('Error fetching payment methods:', error)
    }
  }

  const fetchCommunicationPreferences = async (force: boolean = false, useCache: boolean = true) => {
    if (!user?.id) return

    const CACHE_KEY = buildUserCacheKey('communicationPrefs', user.id)

    const migrateLegacyIfNeeded = async (): Promise<CachedEnvelope<CommunicationPreferences> | null> => {
      const row = await readJsonRaw(CACHE_KEY)
      if (!row || typeof row !== 'object') return null
      const r = row as { preferences?: unknown; data?: unknown; timestamp?: unknown }
      const ts = r.timestamp
      const rawPrefs = r.data ?? r.preferences
      if (typeof ts !== 'number' || rawPrefs == null) return null
      const data = parseCommunicationPreferences(rawPrefs)
      await writeUserCache(CACHE_KEY, data)
      return { data, timestamp: ts }
    }

    let hadCache = false

    if (useCache && !force) {
      let cached = await readUserCache<CommunicationPreferences>(CACHE_KEY)
      if (!cached?.data) {
        const migrated = await migrateLegacyIfNeeded()
        if (migrated) cached = migrated
      }
      if (cached?.data) {
        hadCache = true
        const parsed = parseCommunicationPreferences(cached.data)
        setCommunicationPreferences(parsed)
        lastFetchTimes.current.communicationPreferences = cached.timestamp
        if (!isCacheStale(cached.timestamp, CacheTTL.COMMUNICATION_PREFS)) {
          setCommunicationPreferencesLoading(false)
          return
        }
        setCommunicationPreferencesLoading(false)
      }
    }

    if (!hadCache) {
      setCommunicationPreferencesLoading(true)
    }
    try {
      const res = await apiGet('/api/settings/communication')
      const j = (await res.json()) as { preferences?: CommunicationPreferences; error?: string }
      if (!res.ok) {
        console.warn('UserDataContext: communication prefs', j.error)
        if (!hadCache) setCommunicationPreferences(null)
        return
      }
      const fresh = j.preferences ?? null
      if (fresh) {
        setCommunicationPreferences(fresh)
        lastFetchTimes.current.communicationPreferences = Date.now()
        await writeUserCache(CACHE_KEY, fresh)
      } else if (!hadCache) {
        setCommunicationPreferences(null)
      }
    } catch (e) {
      console.warn('UserDataContext: communication prefs fetch', e)
      if (!hadCache) setCommunicationPreferences(null)
    } finally {
      setCommunicationPreferencesLoading(false)
    }
  }

  const refreshCurrencies = async (force: boolean = false) => {
    setLoading(true)
    await fetchCurrencies(force, !force) // Use cache if not forced
    setLoading(false)
  }

  const refreshExchangeRates = async (force: boolean = false) => {
    setLoading(true)
    await fetchExchangeRates(force, !force)
    setLoading(false)
  }

  const refreshRecipients = async (force: boolean = false) => {
    setLoading(true)
    await fetchRecipients(force, !force)
    setLoading(false)
  }

  const refreshTransactions = async (force: boolean = false) => {
    setLoading(true)
    await fetchTransactions(force, !force)
    setLoading(false)
  }

  const refreshPaymentMethods = async (force: boolean = false) => {
    setLoading(true)
    await fetchPaymentMethods(force, !force)
    setLoading(false)
  }

  const refreshCommunicationPreferences = async (force: boolean = false) => {
    await fetchCommunicationPreferences(force, !force)
  }

  const commitCommunicationPreferences = async (prefs: CommunicationPreferences) => {
    if (!user?.id) return
    setCommunicationPreferences(prefs)
    lastFetchTimes.current.communicationPreferences = Date.now()
    await writeUserCache(buildUserCacheKey('communicationPrefs', user.id), prefs)
  }

  const invalidateCurrencies = async () => {
    await removeUserCache(buildUserCacheKey('currencies', user?.id))
    delete lastFetchTimes.current.currencies
  }

  const invalidateExchangeRates = async () => {
    await removeUserCache(buildUserCacheKey('exchangeRates', user?.id))
    delete lastFetchTimes.current.exchangeRates
  }

  const invalidateRecipients = async () => {
    if (!user?.id) return
    await removeUserCache(buildUserCacheKey('recipients', user.id))
    await bustFinancialFeedCaches(user.id)
    delete lastFetchTimes.current.recipients
  }

  const invalidateTransactions = async () => {
    if (!user?.id) return
    await removeUserCache(buildUserCacheKey('contextTransactions', user.id))
    await bustFinancialFeedCaches(user.id)
    delete lastFetchTimes.current.transactions
  }

  const invalidatePaymentMethods = async () => {
    if (!user?.id) return
    await removeUserCache(buildUserCacheKey('paymentMethods', user.id))
    delete lastFetchTimes.current.paymentMethods
  }

  const invalidateAll = async () => {
    await Promise.all([
      invalidateCurrencies(),
      invalidateExchangeRates(),
      invalidateRecipients(),
      invalidateTransactions(),
      invalidatePaymentMethods(),
    ])
  }

  // Refresh only stale data (for background refresh)
  const refreshStaleData = async () => {
    if (refreshing) return // Prevent multiple simultaneous refreshes
    
    setRefreshing(true)
    try {
      const refreshPromises: Promise<void>[] = []
      
      // Check each data type and refresh if stale
      if (isCacheStale(lastFetchTimes.current.currencies, CacheTTL.CURRENCIES)) {
        refreshPromises.push(fetchCurrencies(false, false))
      }
      if (isCacheStale(lastFetchTimes.current.exchangeRates, CacheTTL.EXCHANGE_RATES)) {
        refreshPromises.push(fetchExchangeRates(false, false))
      }
      if (isCacheStale(lastFetchTimes.current.recipients, CacheTTL.RECIPIENTS)) {
        refreshPromises.push(fetchRecipients(false, false))
      }
      if (isCacheStale(lastFetchTimes.current.transactions, CacheTTL.CONTEXT_TRANSACTIONS)) {
        refreshPromises.push(fetchTransactions(false, false))
      }
      if (isCacheStale(lastFetchTimes.current.paymentMethods, CacheTTL.PAYMENT_METHODS)) {
        refreshPromises.push(fetchPaymentMethods(false, false))
      }
      
      await Promise.all(refreshPromises)
    } catch (error) {
      console.error('UserDataContext: Error refreshing stale data:', error)
    } finally {
      setRefreshing(false)
    }
  }

  // Priority-based initial load: critical data first, then rest
  const refreshAll = async (force: boolean = false, opts?: { suppressGlobalLoading?: boolean }) => {
    const showGlobal = !opts?.suppressGlobalLoading
    if (showGlobal) setLoading(true)

    try {
      // Phase 1: Critical path for send flow + dashboard (recipients must not wait on slow tx fetch)
      await Promise.all([
        fetchExchangeRates(force, !force),
        fetchTransactions(force, !force),
        fetchRecipients(force, !force),
      ])

      // Phase 2: Remaining user data
      await Promise.all([
        fetchCurrencies(force, !force),
        fetchPaymentMethods(force, !force),
        fetchCommunicationPreferences(force, !force),
      ])
    } catch (error) {
      console.error('UserDataContext: Error in refreshAll:', error)
    } finally {
      if (showGlobal) setLoading(false)
    }
  }

  // Initialize data on login
  useEffect(() => {
    if (user && user.id && !dataInitialized) {
      lastUserIdRef.current = user.id
      setDataInitialized(true)
      setIsClearing(false)
      
      // Initialize data immediately when user is available
      // Uses stale-while-revalidate: shows cached data immediately, then refreshes
      const initializeData = async () => {
        try {
          await refreshAll(false, { suppressGlobalLoading: true })
        } catch (error) {
          console.error('UserDataContext: Error initializing data:', error)
        }
      }
      
      initializeData()
    } else if (!user && !isClearing) {
      setIsClearing(true)
      setDataInitialized(false)
      // Clear data when user logs out
      setCurrencies([])
      setExchangeRates([])
      setRecipients([])
      setTransactions([])
      setPaymentMethods([])
      setCommunicationPreferences(null)
      setFinancialFeedsEpoch(0)
      lastFetchTimes.current = {}
      
      // Clear cache (user is null here; use last known id)
      const uid = lastUserIdRef.current
      if (uid) {
        lastUserIdRef.current = null
        void clearAllUserCachesForUserId(uid)
      }
    }
  }, [user, dataInitialized, isClearing])

  // Background refresh when app comes to foreground
  useEffect(() => {
    if (!user?.id || !dataInitialized) return

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground - refresh stale data in background
        // App came to foreground, refresh stale data
        refreshStaleData()
      }
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange)
    return () => subscription.remove()
  }, [user?.id, dataInitialized])

  // Realtime invalidation for transaction + recipient freshness.
  useEffect(() => {
    if (!user?.id || !dataInitialized) return

    const channel = supabase
      .channel(`userdata-refresh-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void (async () => {
            await bustFinancialFeedCaches(user.id)
            await fetchTransactions(true, false)
            setFinancialFeedsEpoch((e) => e + 1)
          })()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recipients',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchRecipients(true, false)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, dataInitialized])

  const value = {
    currencies,
    exchangeRates,
    recipients,
    transactions,
    paymentMethods,
    communicationPreferences,
    communicationPreferencesLoading,
    loading,
    refreshing,
    refreshCurrencies,
    refreshExchangeRates,
    refreshRecipients,
    refreshTransactions,
    refreshPaymentMethods,
    refreshCommunicationPreferences,
    commitCommunicationPreferences,
    refreshAll,
    refreshStaleData,
    invalidateCurrencies,
    invalidateExchangeRates,
    invalidateRecipients,
    invalidateTransactions,
    invalidatePaymentMethods,
    invalidateAll,
    financialFeedsEpoch,
  }

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>
}
