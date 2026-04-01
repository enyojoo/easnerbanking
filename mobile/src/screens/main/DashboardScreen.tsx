import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  Modal,
  Platform,
  FlatList,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  MessageCircle,
  ChevronDown,
  Plus,
  Eye,
  EyeOff,
  ArrowDownLeft,
  ArrowUpRight,
  Monitor,
  Apple,
  ShoppingBag,
  ArrowRight,
  Check,
} from 'lucide-react-native'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import { colors, textStyles, borderRadius, spacing, shadows, userAvatarStyles } from '../../theme'
import { useEffect } from 'react'
import { useFocusRefreshAll } from '../../hooks/useFocusRefresh'
import { useUserData } from '../../contexts/UserDataContext'
import { useFocusEffect } from '@react-navigation/native'
import { useBalance } from '../../contexts/BalanceContext'
import { apiGet, apiPost } from '../../lib/apiClient'
import { ShimmerLoader } from '../../components/premium'
import { getTransactionStatusDisplay } from '../../utils/formatters'
import { initialsFromFullName } from '../../lib/userProfileHelpers'
import { isTier1Complete } from '../../lib/compliance'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const DASHBOARD_SELECTED_CURRENCY_KEY_PREFIX = 'easner_dashboard_selected_currency_'

// Transaction interface for dashboard
interface DashboardTransaction {
  id: string
  transaction_id: string
  type: 'send' | 'receive'
  amount: number
  currency: string
  name?: string
  status: string
  created_at: string
  noah_created_at?: string
  source_type?: string // 'virtual_account', 'liquidation_address', etc.
  source_liquidation_address_id?: string
  metadata?: any
}

export default function DashboardScreen({ navigation }: NavigationProps) {
  const { user, userProfile, refreshUserProfile } = useAuth()
  const { refreshStaleData, refreshing: dataRefreshing } = useUserData()
  const { balances, refreshBalances } = useBalance()
  const insets = useSafeAreaInsets()
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'EUR' | 'GBP'>('USD')
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [availableCurrencies, setAvailableCurrencies] = useState([
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
  ])
  const [canOpenMoreCurrencies, setCanOpenMoreCurrencies] = useState(false)
  const [recentTransactions, setRecentTransactions] = useState<DashboardTransaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(true) // Start as loading until cache loads or API completes
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false) // Track if we've attempted to load data (cache or API)
  const dataLoadedRef = useRef(false)
  const lastSyncTimeRef = useRef(0) // Track last sync time to prevent frequent syncs

  const loadAvailableCurrencies = useCallback(async () => {
    try {
      const response = await apiGet('/api/accounts/available-currencies')
      if (!response.ok) return
      const data = await response.json()
      const offers = Array.isArray(data?.offers) ? data.offers : []
      const extras = offers
        .filter((o: any) => o?.alreadyAdded === true && !o?.disabledReason)
        .map((o: any) => String(o.code || '').toUpperCase())
      const orderedCodes = ['USD', 'EUR', ...extras.filter((c: string) => c !== 'USD' && c !== 'EUR')]
      const mapped = orderedCodes.map((code) => ({
        code,
        name: code === 'USD' ? 'US Dollar' : code === 'EUR' ? 'Euro' : code === 'GBP' ? 'British Pound' : code,
        symbol: code === 'USD' ? '$' : code === 'EUR' ? '€' : code === 'GBP' ? '£' : code,
      }))
      if (mapped.length > 0) {
        setAvailableCurrencies(mapped as any)
      }
      const hasOpenableFromServer =
        typeof data?.hasOpenableExtraCurrencies === 'boolean' ? data.hasOpenableExtraCurrencies : null
      const hasOpenableFromOffers = offers.some((o: any) => !o?.alreadyAdded && !o?.disabledReason)
      setCanOpenMoreCurrencies(hasOpenableFromServer ?? hasOpenableFromOffers)
    } catch {
      // Keep defaults when unavailable
    }
  }, [])

  useEffect(() => {
    void loadAvailableCurrencies()
  }, [loadAvailableCurrencies])

  // Persist selected dashboard balance currency per user.
  useEffect(() => {
    const uid = userProfile?.id || user?.id
    if (!uid) return
    const key = `${DASHBOARD_SELECTED_CURRENCY_KEY_PREFIX}${uid}`
    let mounted = true
    const loadSelectedCurrency = async () => {
      try {
        const saved = (await AsyncStorage.getItem(key))?.toUpperCase() || ''
        if (!saved) return
        if (saved === 'USD' || saved === 'EUR' || saved === 'GBP') {
          if (mounted) setSelectedCurrency(saved as 'USD' | 'EUR' | 'GBP')
        }
      } catch {
        // Ignore storage read failures and keep in-memory selection.
      }
    }
    void loadSelectedCurrency()
    return () => {
      mounted = false
    }
  }, [userProfile?.id, user?.id])

  // Financially sensitive feed: keep cache short and rely on realtime updates.
  const CACHE_TTL = 60 * 1000
  const CACHE_KEY = `easner_dashboard_transactions_${userProfile?.id || ''}`

  // Helper to get cached data
  const getCachedData = useCallback(async <T,>(key: string): Promise<{ data: T; timestamp: number } | null> => {
    try {
      const cached = await AsyncStorage.getItem(key)
      if (!cached) return null
      return JSON.parse(cached)
    } catch {
      return null
    }
  }, [])

  // Helper to set cached data
  const setCachedData = useCallback(async <T,>(key: string, data: T): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now(),
      }))
    } catch (error) {
      console.warn(`[Dashboard] Error caching ${key}:`, error)
    }
  }, [])

  // Helper to check if data is stale
  const isStale = useCallback((timestamp: number | undefined, ttl: number): boolean => {
    if (!timestamp) return true
    return Date.now() - timestamp > ttl
  }, [])

  // Fetch recent transactions with caching
  const fetchRecentTransactions = useCallback(async (force = false, silent = false) => {
    if (!userProfile?.id) return

    let cached: { data: DashboardTransaction[]; timestamp: number } | null = null

    // Try to load from cache first (stale-while-revalidate)
    // Note: Cache is already loaded on mount, so this is mainly for refresh scenarios
    if (!force) {
      cached = await getCachedData<DashboardTransaction[]>(CACHE_KEY)
      if (cached && !isStale(cached.timestamp, CACHE_TTL)) {
        // Data is fresh, use cache (only update if different to avoid unnecessary re-renders)
        if (JSON.stringify(cached.data) !== JSON.stringify(recentTransactions)) {
          setRecentTransactions(cached.data)
        }
        setLoadingTransactions(false)
        setHasAttemptedLoad(true)
        dataLoadedRef.current = true
        return
      } else if (cached) {
        // Data is stale, but already shown from mount - just fetch fresh in background
        // Don't update state again (already set from mount)
        setLoadingTransactions(false)
        setHasAttemptedLoad(true)
        dataLoadedRef.current = true
        // Continue to fetch fresh data in background
      }
    }

    try {
      // Only show loading if not silent and we don't have cached data
      if (!silent && (!cached || force)) {
        setLoadingTransactions(true)
      }

      const params = new URLSearchParams()
      params.append('limit', '5') // Only fetch 5 most recent for dashboard

      const response = await apiGet(`/api/noah/transactions?${params.toString()}`)
      
      if (response.ok && !(response as any).isNetworkError) {
        const data = await response.json()
        const transactionsList = (data.transactions || []).map((tx: any) => ({
          id: tx.id,
          transaction_id: tx.transaction_id,
          type: tx.transaction_type,
          amount: tx.amount,
          currency: tx.currency,
          name: tx.name,
          status: tx.status,
          created_at: tx.created_at,
          noah_created_at: tx.noah_created_at,
          source_type: tx.source_type,
          source_liquidation_address_id: tx.source_liquidation_address_id,
          metadata: tx.metadata,
        }))
        
        setRecentTransactions(transactionsList)
        await setCachedData(CACHE_KEY, transactionsList)
        setHasAttemptedLoad(true)
        dataLoadedRef.current = true
      } else if ((response as any).isNetworkError) {
        // Network error - keep cached data if available
        console.warn("Network error fetching transactions, keeping cached data")
        if (!cached) {
          setRecentTransactions([])
        }
        setHasAttemptedLoad(true)
      } else {
        // Other error - set empty if no cache
        if (!cached) {
          setRecentTransactions([])
        }
        setHasAttemptedLoad(true)
      }
    } catch (error: any) {
      if (error?.message?.includes('Network request failed') || error?.name === 'TypeError') {
        console.warn("Network error fetching transactions:", error?.message || 'Network unavailable')
        // Keep cached data on network error
        if (!cached) {
          setRecentTransactions([])
        }
        setHasAttemptedLoad(true)
      } else {
        console.error("Error fetching transactions:", error)
        if (!cached) {
          setRecentTransactions([])
        }
        setHasAttemptedLoad(true)
      }
    } finally {
      // Always mark that we've attempted to load (prevents empty state flash)
      setHasAttemptedLoad(true)
      // Always stop loading after API attempt completes
      setLoadingTransactions(false)
    }
  }, [userProfile?.id, CACHE_KEY, getCachedData, setCachedData, isStale, hasAttemptedLoad, recentTransactions])

  // Load cached transactions immediately on mount (like balances - instant display)
  useEffect(() => {
    if (!userProfile?.id) {
      setRecentTransactions([])
      setLoadingTransactions(false)
      setHasAttemptedLoad(true)
      return
    }
    
    // Load cache first (like BalanceContext) - show immediately if available
    const loadCachedTransactions = async () => {
      try {
        const cached = await getCachedData<DashboardTransaction[]>(CACHE_KEY)
        if (cached && cached.data && cached.data.length > 0) {
          // Show cached data immediately, even if stale (stale-while-revalidate)
          setRecentTransactions(cached.data)
          setLoadingTransactions(false) // Stop loading since we have data
          setHasAttemptedLoad(true)
          dataLoadedRef.current = true
        } else {
          // No cache - keep loading skeleton until API completes
          // loadingTransactions already true from initial state
          setHasAttemptedLoad(false)
        }
      } catch (error) {
        // Silently fail - will fetch fresh data anyway
        // Keep loading skeleton (already true from initial state)
        setHasAttemptedLoad(false)
      }
    }
    
    loadCachedTransactions()
  }, [userProfile?.id, CACHE_KEY, getCachedData])

  // Initial load - rely on webhooks and real-time for instant updates
  // Only sync for backfill on first load (once per session)
  useEffect(() => {
    if (!userProfile?.id) return
    
    // Only trigger sync once per session for backfill
    // Webhooks and real-time handle new transactions instantly
    const triggerSync = async () => {
      const now = Date.now()
      const SYNC_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes - only for backfill
      
      if (now - lastSyncTimeRef.current < SYNC_COOLDOWN_MS) {
        // Already synced recently, skip
        return
      }
      
      try {
        lastSyncTimeRef.current = now
        // Sync in background - don't block UI
        apiPost('/api/noah/sync-transactions').catch(() => {
          // Silently fail - webhooks/real-time handle new transactions
        })
      } catch (error) {
        // Silently fail - sync is optional, webhooks handle new transactions
      }
    }
    
    // Fetch fresh transactions in background (cache already shown above)
    fetchRecentTransactions(false)
    // Only sync once per session for backfill (webhooks handle new transactions)
    triggerSync()
  }, [userProfile?.id, fetchRecentTransactions])

  // Refresh balances on focus only if stale (don't fetch every time)
  useFocusEffect(
    React.useCallback(() => {
      if (!isTier1Complete(userProfile)) {
        void refreshUserProfile()
      }
      // Only refresh if data is stale - fetchBalances will check cache first
      // This prevents unnecessary API calls when data is fresh
      refreshBalances(false).catch(() => {
        // Silently fail
      })
      // Refresh transactions if stale
      if (dataLoadedRef.current) {
        fetchRecentTransactions(false).catch(() => {
          // Silently fail
        })
      }
      loadAvailableCurrencies().catch(() => {
        // Silently fail
      })
    }, [refreshUserProfile, userProfile, refreshBalances, fetchRecentTransactions, loadAvailableCurrencies])
  )

  const balance = parseFloat((balances as any)[selectedCurrency] || '0')

  // Get user's first name for greeting - use only the first word if multiple names exist
  const dashboardAvatarFullName =
    userProfile?.profile?.full_name ||
    [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ') ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    ''

  const headerAvatarUrl =
    typeof userProfile?.profile?.avatar_url === 'string' && userProfile.profile.avatar_url.trim()
      ? userProfile.profile.avatar_url.trim()
      : null

  const handleCurrencyChange = (currency: 'USD' | 'EUR' | 'GBP') => {
    setSelectedCurrency(currency)
    setShowCurrencyDropdown(false)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  useEffect(() => {
    const uid = userProfile?.id || user?.id
    if (!uid) return
    const key = `${DASHBOARD_SELECTED_CURRENCY_KEY_PREFIX}${uid}`
    AsyncStorage.setItem(key, selectedCurrency).catch(() => {
      // Ignore storage write failures.
    })
  }, [selectedCurrency, userProfile?.id, user?.id])

  const toggleBalanceVisibility = () => {
    setBalanceVisible(!balanceVisible)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const getTransactionIcon = (iconType: string, isReceived: boolean) => {
    const iconColor = colors.primary.main
    
    switch (iconType) {
      case 'inbox':
  return (
          <View style={styles.transactionIconBox}>
            <ArrowDownLeft size={16} color={iconColor} strokeWidth={2.5} />
            </View>
        )
      case 'outbox':
        return (
          <View style={styles.transactionIconBox}>
            <ArrowUpRight size={16} color={iconColor} strokeWidth={2.5} />
              </View>
        )
      case 'monitor':
        return (
          <View style={styles.transactionIconBox}>
            <Monitor size={16} color={iconColor} strokeWidth={2.5} />
            </View>
        )
      case 'shopping':
        return (
          <View style={styles.transactionIconBox}>
            <Apple size={16} color={iconColor} strokeWidth={2.5} />
          </View>
        )
      default:
        return (
          <View style={styles.transactionIconBox}>
            <ArrowUpRight size={16} color={iconColor} strokeWidth={2.5} />
        </View>
        )
    }
  }

  const formatAmount = (amount: number, isReceived: boolean, currency: string = 'USD') => {
    const sign = isReceived ? '+' : '-'
    // Normalize currency to uppercase for comparison
    const normalizedCurrency = (currency || 'USD').toUpperCase()
    const currencySymbol = normalizedCurrency === 'USD' ? '$' : normalizedCurrency === 'EUR' ? '€' : currency
    
    // Check if amount has decimal places
    const absAmount = Math.abs(amount)
    const hasDecimals = absAmount % 1 !== 0
    const formattedAmount = hasDecimals
      ? absAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : absAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    
    return `${sign}${currencySymbol}${formattedAmount}`
  }

  const formatTransactionDate = (dateString: string): string => {
    const date = new Date(dateString)
    const month = date.toLocaleString('en-US', { month: 'short' })
    const day = date.getDate().toString().padStart(2, '0')
    const year = date.getFullYear()
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${month} ${day}, ${year} • ${displayHours}:${minutes} ${ampm}`
  }

  const getTransactionName = (transaction: DashboardTransaction): string => {
    if (transaction.type === 'receive') {
      // Check if it's a crypto deposit (stablecoin deposit via liquidation address)
      if (transaction.source_type === 'liquidation_address' || transaction.source_liquidation_address_id) {
        return 'Stablecoin Deposit'
      }
      
      // For fiat deposits (virtual account/ACH), show sender name only (not "Received from...")
      if (transaction.source_type === 'virtual_account') {
        // Check metadata for sender information
        const senderName = transaction.metadata?.source?.sender_name || 
                          transaction.metadata?.source?.originator_name ||
                          transaction.name
        if (senderName) {
          return senderName // Just the sender name for ACH deposits
        }
        return 'Bank Deposit'
      }
      
      // Fallback for other receive types
      return transaction.name ? `Received from ${transaction.name}` : 'Received'
    } else {
      // For sends, use recipient name
      return transaction.name ? `Sent to ${transaction.name}` : 'Sent'
    }
  }

  const getTransactionIconType = (transaction: DashboardTransaction): string => {
    if (transaction.type === 'receive') return 'inbox'
    // Could add more logic here based on transaction metadata
    return 'outbox'
  }

  const formatBalanceDisplay = (amount: number, currency: 'USD' | 'EUR'): string => {
    const currencySymbol = currency === 'USD' ? '$' : '€'
    
    // Format as "X Million" or "X Billion" if >= 100 million
    if (amount >= 100000000) {
      // Billions
      const billions = amount / 1000000000
      if (billions >= 1) {
        return `${currencySymbol}${billions.toFixed(1)} Billion`
      }
      // Millions (100M - 999M)
      const millions = amount / 1000000
      return `${currencySymbol}${millions.toFixed(1)} Million`
    }
    
    // Show full number for amounts below 100 million
    return `${currencySymbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const renderCurrencyPicker = () => {
    // Calculate approximate height: header (80) + item height (80) * number of items + padding
    const itemHeight = 80
    const headerHeight = 80
    const padding = spacing[4]
    const estimatedHeight = headerHeight + (itemHeight * availableCurrencies.length) + padding + insets.bottom

  return (
      <Modal
        visible={showCurrencyDropdown}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowCurrencyDropdown(false)
      }}
    >
      <TouchableOpacity 
          style={styles.modalOverlay}
        activeOpacity={1}
          onPress={() => setShowCurrencyDropdown(false)}
        >
          <View style={[styles.modalContainer, { 
            maxHeight: estimatedHeight,
            paddingBottom: insets.bottom,
          }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Balance</Text>
              <View style={styles.modalHeaderActions}>
                {canOpenMoreCurrencies ? (
                  <TouchableOpacity
                    style={styles.closeButton}
                    accessibilityRole="button"
                    accessibilityLabel="Open currency account"
                    onPress={() => {
                      setShowCurrencyDropdown(false)
                      navigation.navigate('OpenCurrencyAccount')
                    }}
                  >
                    <Plus size={20} color={colors.text.secondary} strokeWidth={2.25} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    setShowCurrencyDropdown(false)
                  }}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.currencyListContainer}>
              {availableCurrencies.map((item) => {
                const balance = parseFloat((balances as any)[item.code] || '0')
                // Use the same formatting as the main balance display for consistency
                const balanceDisplay = balanceVisible 
                  ? formatBalanceDisplay(balance, item.code as 'USD' | 'EUR')
                  : '••••••'
                const isSelected = selectedCurrency === item.code
                return (
                  <TouchableOpacity
                    key={item.code}
                    style={[
                      styles.currencyItem,
                      isSelected && styles.currencyItemActive
                    ]}
                    onPress={async () => {
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      handleCurrencyChange(item.code as 'USD' | 'EUR' | 'GBP')
                      setShowCurrencyDropdown(false)
                    }}
                  >
                    <View style={styles.flagContainerSmall}>
                      <CurrencyFlag currency={item.code} size={24} style={styles.flagImageSmall} />
                    </View>
                    <View style={styles.currencyItemInfo}>
                      <Text style={styles.currencyItemCode}>{item.code} Balance</Text>
                      <Text style={styles.currencyItemBalance}>
                        {balanceDisplay}
                      </Text>
                    </View>
                    <View style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected
                    ]}>
                      {isSelected && (
                        <View style={styles.checkboxInner} />
                      )}
            </View>
                  </TouchableOpacity>
                )
              })}
          </View>
        </View>
      </TouchableOpacity>
      </Modal>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header: avatar | verify banner (if needed) | support */}
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {/* Header Content */}
          <View style={styles.headerContent}>
            {/* User Greeting with Avatar */}
            <View style={styles.greetingContainer}>
              <TouchableOpacity
                style={userAvatarStyles.circle}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  navigation.navigate('ProfileEdit' as any)
                }}
                activeOpacity={0.7}
              >
                {headerAvatarUrl ? (
                  <Image source={{ uri: headerAvatarUrl }} style={userAvatarStyles.image} />
                ) : (
                  <Text style={userAvatarStyles.initials}>
                    {initialsFromFullName(dashboardAvatarFullName)}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {!isTier1Complete(userProfile) ? (
              <View style={styles.verifyAccountBannerSlot}>
                <TouchableOpacity
                  style={styles.verifyAccountBanner}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    navigation.navigate('AccountVerification' as never)
                  }}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Verify identity to unlock banking. Begin."
                >
                  <View style={styles.verifyAccountBannerTextWrap}>
                    <Text style={styles.verifyAccountBannerTitle} numberOfLines={2}>
                      Verify identity to unlock banking
                    </Text>
                  </View>
                  <Text style={styles.verifyAccountBannerCta}>Begin</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.supportHeaderButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.navigate('Support' as never)
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Support"
            >
              <MessageCircle size={22} color={colors.primary.main} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Main Content - White Card */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={async () => {
              setRefreshing(true)
              try {
                // Trigger sync to update transaction table in Supabase
                // This ensures any missing transactions are synced from Bridge API
                const syncPromise = apiPost('/api/noah/sync-transactions').catch((error) => {
                  console.warn('[DASHBOARD] Sync failed on pull-to-refresh:', error)
                  // Don't block refresh if sync fails
                })
                
                // Refresh all data (forced - user pulled to refresh)
                // Use Promise.allSettled to ensure all promises complete even if some fail
                await Promise.allSettled([
                  syncPromise, // Sync transactions from Bridge API
                  refreshStaleData(), // Refresh stale user data
                  refreshBalances(true), // Force refresh balances (bypass cache)
                  fetchRecentTransactions(true), // Force refresh transactions (bypass cache)
                ])
              } catch (error) {
                console.error('Error refreshing dashboard:', error)
              } finally {
                // Always reset refreshing state, even if there's an error
                setRefreshing(false)
              }
            }}
            tintColor={colors.primary.main}
          />
        }
      >
        <View style={styles.whiteCard}>
          {/* Currency Selector with Plus Button */}
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.currencySelector}
              onPress={() => {
                // Open dropdown immediately
                setShowCurrencyDropdown(true)
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                // Refresh balances in background to ensure they're in sync
                refreshBalances(false).catch(error => {
                  console.error('Error refreshing balances:', error)
                })
              }}
              activeOpacity={0.7}
            >
              <View style={styles.flagContainer}>
                <CurrencyFlag currency={selectedCurrency} size={28} style={styles.flagImage} />
              </View>
              <Text style={styles.currencyText}>{selectedCurrency} Balance</Text>
              <ChevronDown size={16} color={colors.text.primary} strokeWidth={2} />
            </TouchableOpacity>
          {/* Plus button hidden for now - will be used to add new balances when available */}
          {false && (
            <TouchableOpacity
              style={styles.addFundsButtonSmall}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                // Navigate to add funds
              }}
              activeOpacity={0.7}
            >
              <Plus size={20} color={colors.primary.main} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
      </View>

          {/* Currency Picker Modal */}
          {renderCurrencyPicker()}

          {/* Balance Display */}
          <View style={styles.balanceContainer}>
            <Text style={styles.balanceAmount}>
              {balanceVisible 
                ? formatBalanceDisplay(balance, selectedCurrency)
                : '••••••'}
            </Text>
            <TouchableOpacity 
              style={styles.hideBalanceButton}
              onPress={toggleBalanceVisibility}
              activeOpacity={0.7}
            >
              {balanceVisible ? (
                <EyeOff size={22} color={colors.primary.main} strokeWidth={2} />
              ) : (
                <Eye size={22} color={colors.primary.main} strokeWidth={2} />
              )}
          </TouchableOpacity>
              </View>
              
          {/* Receive and Send Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.navigate('ReceiveMoney' as never, {
                  currency: selectedCurrency,
                } as never)
              }}
              activeOpacity={0.7}
            >
              <ArrowDownLeft size={20} color={colors.primary.main} strokeWidth={2.5} />
              <Text style={styles.actionButtonText}>Receive</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.navigate('SelectRecentRecipient' as never, {
                  preferredBalanceCurrency: selectedCurrency === 'USD' || selectedCurrency === 'EUR'
                    ? selectedCurrency
                    : undefined,
                } as never)
              }}
              activeOpacity={0.7}
            >
              <ArrowUpRight size={20} color={colors.primary.main} strokeWidth={2.5} />
              <Text style={styles.actionButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
        </View>
        
        {/* Transactions Section */}
        <View style={styles.transactionsSection}>
          {!loadingTransactions && recentTransactions.length > 0 && (
            <View style={styles.transactionsHeader}>
              <Text style={styles.transactionsTitle}>Transactions</Text>
              <TouchableOpacity 
                style={styles.viewAllButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  navigation.navigate('Transactions' as never)
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.viewAllText}>All</Text>
                <ArrowRight size={14} color={colors.primary.main} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}
        
          {/* Transaction List */}
          {loadingTransactions ? (
            <View style={styles.skeletonContainer}>
              {[1, 2, 3, 4, 5].map((i) => (
                <ShimmerLoader 
                  key={i}
                  width="100%" 
                  height={72} 
                  borderRadius={borderRadius.md}
                  style={{ marginBottom: spacing[2] }}
                />
              ))}
            </View>
          ) : recentTransactions.length === 0 && hasAttemptedLoad ? (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="receipt-outline" size={40} color={colors.neutral[400]} />
              </View>
              <Text style={styles.emptyStateTitle}>No transactions yet</Text>
              <Text style={styles.emptyStateText}>
                Your recent transactions will appear here once you send, receive or spend money
              </Text>
            </View>
          ) : (
            recentTransactions.map((transaction, index) => {
              const isReceived = transaction.type === 'receive'
              const iconType = getTransactionIconType(transaction)
              const isLast = index === recentTransactions.length - 1
              return (
                <TouchableOpacity
                  key={transaction.id || transaction.transaction_id} 
                  style={[styles.transactionItem, isLast && styles.transactionItemLast]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    navigation.navigate('TransactionDetails' as never, { 
                      transactionId: transaction.transaction_id,
                      fromScreen: 'Dashboard'
                    } as never)
                  }}
                  activeOpacity={0.7}
                >
                  {getTransactionIcon(iconType, isReceived)}
                  <View style={styles.transactionDetails}>
                    <Text style={styles.transactionName}>
                      {getTransactionName(transaction)}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatTransactionDate(transaction.noah_created_at || transaction.created_at)}
                    </Text>
                  </View>
                  <View style={styles.transactionAmountContainer}>
                    <Text
                      style={[
                        styles.transactionAmount,
                        isReceived && styles.transactionAmountReceived
                      ]}
                    >
                      {formatAmount(transaction.amount, isReceived, transaction.currency)}
                    </Text>
                    {(() => {
                      const statusDisplay = getTransactionStatusDisplay(transaction.status)
                      return statusDisplay ? (
                        <Text
                          style={[
                            styles.transactionStatus,
                            { color: statusDisplay.color }
                          ]}
                        >
                          {statusDisplay.label}
                        </Text>
                      ) : null
                    })()}
                  </View>
                </TouchableOpacity>
              )
            })
          )}
        </View>
    </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary, // White/light background for the page
  },
  headerWrapper: {
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[1],
  },
  header: {
    paddingVertical: spacing[1],
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flexShrink: 0,
  },
  verifyAccountBannerSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyAccountBanner: {
    alignSelf: 'center',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.lg,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    gap: spacing[2],
    ...shadows.xs,
  },
  verifyAccountBannerTextWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  verifyAccountBannerTitle: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontWeight: '600',
    fontFamily: 'Outfit-SemiBold',
  },
  verifyAccountBannerCta: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontFamily: 'Outfit-SemiBold',
    fontWeight: '600',
    textDecorationLine: 'underline',
    flexShrink: 0,
  },
  supportHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    flexShrink: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 100, // Space for bottom navigation bar
  },
  whiteCard: {
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[5],
  },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  currencySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: 0,
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.full,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    height: 40,
  },
  flagContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.frame.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  flagImage: {
    width: 24,
    height: 24,
  },
  currencyText: {
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
  },
  addFundsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  addFundsButtonSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.frame.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currencyListContainer: {
    paddingBottom: spacing[2],
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  currencyItemActive: {
    backgroundColor: colors.primary.main + '10',
  },
  currencyItemInfo: {
    flex: 1,
  },
  currencyItemCode: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    marginBottom: 2,
  },
  currencyItemBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    borderColor: colors.primary.main,
    backgroundColor: colors.primary.main,
  },
  checkboxInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background.primary,
  },
  flagContainerSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.frame.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flagImageSmall: {
    width: 24,
    height: 24,
  },
  currencyOptionText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[8],
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Outfit-Black',
    letterSpacing: -0.5,
    flex: 1,
  },
  hideBalanceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing[2],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 50,
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.xl,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  actionButtonText: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  transactionsSection: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[8],
    backgroundColor: colors.frame.background,
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    marginHorizontal: spacing[5],
    marginTop: spacing[3],
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  transactionsTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: '#B9CAFF',
    borderRadius: borderRadius.full,
  },
  viewAllText: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: 'Outfit-SemiBold',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: '#E2E2E2', // Match More screen divider color
  },
  transactionItemLast: {
    borderBottomWidth: 0,
  },
  transactionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
    marginBottom: spacing[1],
  },
  transactionDate: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
    gap: spacing[0.5],
  },
  transactionAmount: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  transactionAmountReceived: {
    color: colors.primary.main,
  },
  transactionStatus: {
    ...textStyles.bodySmall,
    fontFamily: 'Outfit-Regular',
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[5],
    marginHorizontal: spacing[5],
    marginTop: spacing[3],
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  emptyStateTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    marginBottom: spacing[2],
  },
  emptyStateText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    fontFamily: 'Outfit-Regular',
  },
  skeletonContainer: {
    paddingHorizontal: spacing[5],
  },
})
