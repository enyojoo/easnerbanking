import React, { useState, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  RefreshControl,
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
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
  X,
  Receipt,
} from 'lucide-react-native'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import {
  useThemeColors,
  textStyles,
  borderRadius,
  spacing,
  shadows,
  surfaceChromeCircleStyle,
  userAvatarStyles,
  lineHeight,
  fontFamily,
} from '../../theme'
import type { Colors } from '../../theme/colors'
import { scaledFontSize } from '../../theme/typography'
import { ripple } from '../../lib/androidRipple'
import { useEffect } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useBalance } from '../../contexts/BalanceContext'
import { apiGet, apiPost } from '../../lib/apiClient'
import { useQueryClient } from '@tanstack/react-query'
import { useScope } from '../../query/scope'
import { apiFetch } from '../../query/api-client'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import { ListRowSkeleton } from '../../components/skeletons'
import { SectionCard } from '../../components/ui'
import { getTransactionStatusDisplay } from '../../utils/formatters'
import { initialsFromFullName } from '../../lib/userProfileHelpers'
import { isTier1Complete } from '../../lib/compliance'
import { noahService } from '../../lib/noahService'
import { useTransactionsList } from '../../hooks/queries'
import { isEasnerProductReceiveTitle, isEasnerProductSendTitle, markRecentMoneyActivity, qk } from '@easner/shared'
import { avatarImageSource, normalizeAvatarUrl, warmAvatarCache } from '../../lib/avatarCache'

const DASHBOARD_SELECTED_CURRENCY_KEY_PREFIX = 'easner_dashboard_selected_currency_'
const DASHBOARD_RECENT_TX_CACHE_KEY_PREFIX = 'easner_dashboard_recent_tx_'
const DASHBOARD_RECENT_TX_CACHE_TTL_MS = 60 * 60 * 1000

// Transaction interface for dashboard
interface DashboardTransaction {
  id: string
  transaction_id: string
  ledger_row_id?: string
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
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  /** Tab bar is docked (not overlaying); only end-of-scroll breathing room. */
  const scrollBottomPadding = spacing[8]
  const styles = useMemo(() => createDashboardStyles(palette, scrollBottomPadding), [palette, scrollBottomPadding])
  const heroBalanceFontSize = scaledFontSize(56)
  const heroBalanceLineHeight =
    Math.round(heroBalanceFontSize * lineHeight.tight) + (Platform.OS === 'android' ? 6 : 4)
  const { user, userProfile, refreshUserProfile, loading: authLoading } = useAuth()
  const { scope } = useScope()
  const qc = useQueryClient()
  const txQuery = useTransactionsList({}, 5)
  const { balances, hasResolvedBalance, refreshBalances } = useBalance()
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'EUR' | 'GBP'>('USD')
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [availableCurrencies, setAvailableCurrencies] = useState([
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
  ])
  const [canOpenMoreCurrencies, setCanOpenMoreCurrencies] = useState(false)
  /** Throttle Noah sync on dashboard focus (parity with business `BusinessVerificationSection`). */
  const lastDashboardNoahSyncRef = useRef(0)
  /** Throttle chain-ledger repair scans (missed Turnkey deposit recovery). */
  const lastDashboardChainLedgerSyncRef = useRef(0)
  const chainLedgerSyncInFlightRef = useRef<Promise<boolean> | null>(null)

  const syncChainLedgerIfDue = useCallback(
    async (force: boolean = false): Promise<boolean> => {
      const now = Date.now()
      const MIN_MS = 10 * 60_000
      if (!force && now - lastDashboardChainLedgerSyncRef.current < MIN_MS) return false
      if (chainLedgerSyncInFlightRef.current) {
        return chainLedgerSyncInFlightRef.current
      }

      const run = (async () => {
        try {
          const response = await apiPost('/api/wallets/sync-chain-ledger', undefined, {
            headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
          })
          if (!response.ok) return false
          lastDashboardChainLedgerSyncRef.current = Date.now()
          const payload = await response.json().catch(() => null)
          const upserts = Number(
            (payload as any)?.result?.upserts ?? (payload as any)?.result?.upserted ?? 0,
          )
          const inserted = Number.isFinite(upserts) && upserts > 0
          if (inserted) markRecentMoneyActivity()
          return inserted
        } catch {
          return false
        } finally {
          chainLedgerSyncInFlightRef.current = null
        }
      })()

      chainLedgerSyncInFlightRef.current = run
      return run
    },
    [],
  )

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

  const queryRecent = useMemo<DashboardTransaction[]>(() => {
    const firstPage = txQuery.data?.pages?.[0]?.transactions ?? []
    return (firstPage as DashboardTransaction[]).slice(0, 5)
  }, [txQuery.data])
  const [cachedRecentTransactions, setCachedRecentTransactions] = useState<DashboardTransaction[]>([])
  const recentTransactions = queryRecent.length > 0 ? queryRecent : cachedRecentTransactions
  const hasAnyTransactionData = recentTransactions.length > 0
  const loadingTransactions = txQuery.isPending && !hasAnyTransactionData
  const hasAttemptedLoad = txQuery.isFetched || recentTransactions.length > 0
  const lastStableBalanceTextRef = useRef<Record<string, string>>({})

  useEffect(() => {
    const uid = userProfile?.id || user?.id
    if (!uid) return
    const key = `${DASHBOARD_RECENT_TX_CACHE_KEY_PREFIX}${uid}`
    let mounted = true
    const loadCachedRecent = async () => {
      try {
        const raw = await AsyncStorage.getItem(key)
        if (!raw) return
        const parsed = JSON.parse(raw) as { at?: number; rows?: DashboardTransaction[] } | null
        const at = Number(parsed?.at ?? 0)
        const rows = Array.isArray(parsed?.rows) ? parsed?.rows : []
        if (!Number.isFinite(at) || Date.now() - at > DASHBOARD_RECENT_TX_CACHE_TTL_MS) return
        if (mounted && rows.length > 0) {
          setCachedRecentTransactions(rows.slice(0, 5))
        }
      } catch {
        // Ignore malformed/expired cache.
      }
    }
    void loadCachedRecent()
    return () => {
      mounted = false
    }
  }, [userProfile?.id, user?.id])

  useEffect(() => {
    const uid = userProfile?.id || user?.id
    if (!uid) return
    if (queryRecent.length === 0) return
    const key = `${DASHBOARD_RECENT_TX_CACHE_KEY_PREFIX}${uid}`
    const payload = JSON.stringify({
      at: Date.now(),
      rows: queryRecent.slice(0, 5),
    })
    AsyncStorage.setItem(key, payload).catch(() => {
      // Ignore storage write failures.
    })
  }, [queryRecent, userProfile?.id, user?.id])

  useEffect(() => {
    if (!scope || recentTransactions.length === 0) return
    for (const row of recentTransactions.slice(0, 10)) {
      const txId = String(row.ledger_row_id?.trim() || row.transaction_id || row.id || '').trim()
      if (!txId) continue
      void qc.prefetchQuery({
        queryKey: qk.transactions.detail(scope, txId),
        queryFn: () =>
          apiFetch<{ transaction?: DashboardTransaction }>(
            `/api/transactions/${encodeURIComponent(txId)}`,
            { headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS } },
          ),
        staleTime: 45_000,
      })
    }
  }, [qc, recentTransactions, scope])

  // Refresh balances on focus only if stale (don't fetch every time)
  useFocusEffect(
    React.useCallback(() => {
      /**
       * Individual Tier 1: pull Noah → DB then refresh profile (same as business verification section
       * on web). `refreshUserProfile` alone only re-reads Supabase; it does not call Noah.
       */
      const role = userProfile?.role ?? userProfile?.profile?.role
      const needsConsumerTier1Sync =
        !!user?.id && !!userProfile?.id && role !== 'business' && !isTier1Complete(userProfile)
      if (needsConsumerTier1Sync) {
        const now = Date.now()
        const MIN_MS = 10 * 60_000
        if (now - lastDashboardNoahSyncRef.current >= MIN_MS) {
          lastDashboardNoahSyncRef.current = now
          void (async () => {
            try {
              const r = await noahService.syncStatus({ scope: 'individual' })
              if (r.success && r.synced) {
                await refreshUserProfile()
              } else {
                await refreshUserProfile()
              }
            } catch {
              await refreshUserProfile()
            }
          })()
        }
      }
      // Only refresh if data is stale - fetchBalances will check cache first
      // This prevents unnecessary API calls when data is fresh
      refreshBalances(false).catch(() => {
        // Silently fail
      })
      void (async () => {
        const insertedRows = await syncChainLedgerIfDue(false)
        if (insertedRows) {
          await txQuery.refetch()
        }
      })()
      void txQuery.refetch()
      loadAvailableCurrencies().catch(() => {
        // Silently fail
      })
    }, [
      user?.id,
      userProfile,
      refreshUserProfile,
      refreshBalances,
      loadAvailableCurrencies,
      syncChainLedgerIfDue,
      txQuery,
    ])
  )

  const balanceRaw = (balances as Record<string, string | undefined>)[selectedCurrency]
  const hasBalanceForSelectedCurrency = typeof balanceRaw === 'string' && balanceRaw.trim().length > 0
  const balance = hasBalanceForSelectedCurrency ? parseFloat(balanceRaw as string) : 0
  const canRenderNumericBalance = hasResolvedBalance && hasBalanceForSelectedCurrency
  const resolvedBalanceText = canRenderNumericBalance
    ? formatBalanceDisplay(balance, selectedCurrency)
    : null
  if (resolvedBalanceText) {
    lastStableBalanceTextRef.current[selectedCurrency] = resolvedBalanceText
  }
  const visibleBalanceText = !balanceVisible
    ? '••••••'
    : resolvedBalanceText ??
      lastStableBalanceTextRef.current[selectedCurrency] ??
      null

  const shouldShowBalanceSkeleton = balanceVisible && !visibleBalanceText

  /** Only after `userProfile` is loaded: `isTier1Complete(undefined)` is false and would flash the banner. */
  const showVerifyIdentityBanner =
    !authLoading && userProfile != null && !isTier1Complete(userProfile)

  // Get user's first name for greeting - use only the first word if multiple names exist
  const dashboardAvatarFullName =
    userProfile?.profile?.full_name ||
    [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ') ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    ''

  const headerAvatarUrl = normalizeAvatarUrl(userProfile?.profile?.avatar_url)
  const headerAvatarSource = avatarImageSource(userProfile?.profile?.avatar_url)

  useEffect(() => {
    warmAvatarCache(headerAvatarUrl)
  }, [headerAvatarUrl])

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
    const iconColor = palette.primary.main
    
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
      if (transaction.source_type === 'liquidation_address' || transaction.source_liquidation_address_id) {
        return 'Stablecoin Deposit'
      }

      const display = String(transaction.name || '').trim()
      if (display === 'Stablecoin Deposit') {
        return display
      }

      if (transaction.source_type === 'virtual_account') {
        const senderName =
          transaction.metadata?.source?.sender_name ||
          transaction.metadata?.source?.originator_name ||
          transaction.name
        if (senderName) {
          return String(senderName).trim()
        }
        return 'Bank Deposit'
      }

      if (display && !isEasnerProductReceiveTitle(display)) {
        return display
      }

      if (isEasnerProductReceiveTitle(display)) {
        return display
      }

      return transaction.name ? `Received from ${transaction.name}` : 'Received'
    } else {
      if (isEasnerProductSendTitle(transaction.name)) {
        return String(transaction.name).trim()
      }
      return transaction.name ? `Sent to ${transaction.name}` : 'Sent'
    }
  }

  const getTransactionIconType = (transaction: DashboardTransaction): string => {
    if (transaction.type === 'receive') return 'inbox'
    // Could add more logic here based on transaction metadata
    return 'outbox'
  }

  function formatBalanceDisplay(amount: number, currency: 'USD' | 'EUR' | 'GBP'): string {
    const currencySymbol =
      currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency
    
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
      <Pressable 
         android_ripple={ripple.neutral} 
          style={styles.modalOverlay} onPress={() => setShowCurrencyDropdown(false)}
        >
          <View style={[styles.modalContainer, { 
            maxHeight: estimatedHeight,
            paddingBottom: insets.bottom,
          }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Balance</Text>
              <View style={styles.modalHeaderActions}>
                {canOpenMoreCurrencies ? (
                  <Pressable
                   android_ripple={ripple.neutral}
                    style={styles.closeButton}
                    accessibilityRole="button"
                    accessibilityLabel="Open currency account"
                    onPress={() => {
                      setShowCurrencyDropdown(false)
                      navigation.navigate('OpenCurrencyAccount')
                    }}
                  >
                    <Plus size={20} color={palette.text.secondary} strokeWidth={2.25} />
                  </Pressable>
                ) : null}
                <Pressable
                 android_ripple={ripple.neutral}
                  onPress={() => {
                    setShowCurrencyDropdown(false)
                  }}
                  style={styles.closeButton}
                >
                  <X size={24} color={palette.text.secondary} strokeWidth={2} />
                </Pressable>
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
                  <Pressable
                   android_ripple={ripple.neutral}
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
                  </Pressable>
                )
              })}
          </View>
        </View>
      </Pressable>
      </Modal>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header: avatar | verify banner (if needed) | support */}
      <View style={[styles.headerWrapper, { paddingTop: insets.top + spacing[4] }]}>
        <View style={styles.header}>
          {/* Header Content */}
          <View style={styles.headerContent}>
            {/* Profile avatar */}
            <View style={styles.greetingContainer}>
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.headerAvatarButton}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  navigation.navigate('Profile' as any)
                }} >
                {headerAvatarSource ? (
                  <Image
                    source={headerAvatarSource}
                    style={userAvatarStyles.image}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={userAvatarStyles.initials}>
                    {initialsFromFullName(dashboardAvatarFullName)}
                  </Text>
                )}
              </Pressable>
            </View>

            {showVerifyIdentityBanner ? (
              <View style={styles.verifyAccountBannerSlot}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.verifyAccountBanner}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    navigation.navigate('AccountVerification' as never)
                  }} accessibilityRole="button"
                  accessibilityLabel="Verify identity to unlock banking. Begin."
                >
                  <View style={styles.verifyAccountBannerTextWrap}>
                    <Text style={styles.verifyAccountBannerTitle} numberOfLines={2}>
                      Verify identity to unlock banking
                    </Text>
                  </View>
                  <Text style={styles.verifyAccountBannerCta}>Begin</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
             android_ripple={ripple.neutral}
              style={styles.supportHeaderButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.navigate('Support' as never)
              }} accessibilityRole="button"
              accessibilityLabel="Support"
            >
              <MessageCircle size={22} color={palette.primary.main} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Balance hero + quick actions */}
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
                await syncChainLedgerIfDue(true)
                await Promise.all([refreshBalances(true), txQuery.refetch()])
              } catch (error) {
                console.error('Error refreshing dashboard:', error)
              } finally {
                setRefreshing(false)
              }
            }}
            tintColor={palette.primary.main}
          />
        }
      >
        <LinearGradient
          colors={palette.primary.heroGradient as unknown as readonly [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroInner}>
          {/* Currency Selector + eye toggle */}
          <View style={styles.topActions}>
            <Pressable
             android_ripple={ripple.heroOnDark}
              style={styles.currencySelector}
              onPress={() => {
                setShowCurrencyDropdown(true)
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                refreshBalances(false).catch(error => {
                  console.error('Error refreshing balances:', error)
                })
              }} >
              <View style={styles.flagContainer}>
                <CurrencyFlag currency={selectedCurrency} size={20} style={styles.flagImage} />
              </View>
              <Text style={styles.currencyText}>{selectedCurrency} Balance</Text>
              <ChevronDown size={16} color="#FFFFFF" strokeWidth={2.25} />
            </Pressable>
            <Pressable
             android_ripple={ripple.heroOnDark}
              style={styles.hideBalanceButton}
              onPress={toggleBalanceVisibility}
              accessibilityRole="button"
              accessibilityLabel={balanceVisible ? 'Hide balance' : 'Show balance'}
            >
              {balanceVisible ? (
                <EyeOff size={20} color="#FFFFFF" strokeWidth={2} />
              ) : (
                <Eye size={20} color="#FFFFFF" strokeWidth={2} />
              )}
            </Pressable>
          </View>

          {/* Currency Picker Modal */}
          {renderCurrencyPicker()}

          {/* Balance Display */}
          <View style={styles.balanceContainer}>
            {shouldShowBalanceSkeleton ? (
              <View style={styles.balanceSkeletonWrap}>
                <ShimmerLoader
                  width={240}
                  height={Math.max(48, Math.round(heroBalanceFontSize * 0.8))}
                  borderRadius={borderRadius.lg}
                />
              </View>
            ) : (
              <Text
                style={[
                  textStyles.balanceDisplay,
                  styles.balanceAmount,
                  {
                    color: '#FFFFFF',
                    fontSize: heroBalanceFontSize,
                    lineHeight: heroBalanceLineHeight,
                  },
                ]}
              >
                {visibleBalanceText}
              </Text>
            )}
          </View>

          {/* Receive and Send Buttons */}
          <View style={styles.actionButtons}>
            <Pressable
              android_ripple={ripple.heroOnLight}
              style={({ pressed }) => [styles.heroReceiveButton, pressed && styles.heroBtnPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.navigate('ReceiveMoney' as never, {
                  currency: selectedCurrency,
                } as never)
              }}
              accessibilityRole="button"
              accessibilityLabel="Receive"
            >
              <ArrowDownLeft size={18} color={palette.primary.main} strokeWidth={2.5} />
              <Text style={styles.heroReceiveLabel}>Receive</Text>
            </Pressable>
            <Pressable
              android_ripple={ripple.heroOnDark}
              style={({ pressed }) => [styles.heroSendButton, pressed && styles.heroBtnPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.navigate('SelectRecentRecipient' as never, {
                  preferredBalanceCurrency:
                    selectedCurrency === 'USD' || selectedCurrency === 'EUR'
                      ? selectedCurrency
                      : undefined,
                } as never)
              }}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <ArrowUpRight size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.heroSendLabel}>Send</Text>
            </Pressable>
          </View>
          </View>
        </LinearGradient>
        
        {/* Recent transactions: title row sits on canvas; list stays in SectionCard */}
        <View style={styles.transactionsBlock}>
          {!loadingTransactions && recentTransactions.length > 0 && (
            <View style={styles.transactionsHeader}>
              <Text style={styles.transactionsTitle} numberOfLines={1}>
                Recent Transactions
              </Text>
              <Pressable
                android_ripple={ripple.neutral}
                style={styles.viewAllButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  navigation.navigate('Transactions' as never)
                }}
              >
                <Text style={styles.viewAllText}>View all</Text>
              </Pressable>
            </View>
          )}

          <SectionCard style={styles.transactionsSection} flush>
          {/* Transaction List */}
          {loadingTransactions ? (
            <View style={styles.skeletonContainer}>
              {[0, 1, 2].map((i) => (
                <ListRowSkeleton key={i} variant="transaction" showDivider={i < 2} />
              ))}
            </View>
          ) : recentTransactions.length === 0 && hasAttemptedLoad ? (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconContainer}>
                <Receipt size={36} color={palette.text.tertiary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyStateTitle}>No transactions yet</Text>
              <Text style={styles.emptyStateText}>
                Your recent transactions will appear here once you send, receive or spend money
              </Text>
            </View>
          ) : (
            <View>
              {recentTransactions.map((transaction, index) => {
                const isReceived = transaction.type === 'receive'
                const iconType = getTransactionIconType(transaction)
                const isLast = index === recentTransactions.length - 1
                const statusDisplay = getTransactionStatusDisplay(transaction.status)
                return (
                  <Pressable
                   android_ripple={ripple.neutral}
                    key={transaction.id || transaction.transaction_id}
                    style={({ pressed }) => [
                      styles.transactionItem,
                      !isLast && styles.transactionItemDivider,
                      pressed && styles.transactionItemPressed,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      navigation.navigate('TransactionDetails' as never, {
                        transactionId:
                          transaction.ledger_row_id?.trim() || transaction.transaction_id,
                        fromScreen: 'Dashboard',
                        initialTransaction: transaction,
                      } as never)
                    }} >
                    {getTransactionIcon(iconType, isReceived)}
                    <View style={styles.transactionDetails}>
                      <Text style={styles.transactionName} numberOfLines={1}>
                        {getTransactionName(transaction)}
                      </Text>
                      <Text style={styles.transactionDate} numberOfLines={1}>
                        {formatTransactionDate(transaction.noah_created_at || transaction.created_at)}
                      </Text>
                    </View>
                    <View style={styles.transactionAmountContainer}>
                      <Text
                        style={[
                          styles.transactionAmount,
                          isReceived && styles.transactionAmountReceived,
                        ]}
                      >
                        {formatAmount(transaction.amount, isReceived, transaction.currency)}
                      </Text>
                      {statusDisplay ? (
                        <Text
                          style={[
                            styles.transactionStatusText,
                            {
                              color:
                                statusDisplay.tone === 'completed'
                                  ? palette.success.main
                                  : statusDisplay.tone === 'failed'
                                    ? palette.error.main
                                    : statusDisplay.tone === 'pending' || statusDisplay.tone === 'processing'
                                      ? palette.warning.main
                                      : palette.text.secondary,
                            },
                          ]}
                        >
                          {statusDisplay.label}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          )}
        </SectionCard>
        </View>
    </ScrollView>
    </View>
  )
}

function createDashboardStyles(c: Colors, scrollBottomPadding: number) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.semantic.background,
  },
  headerWrapper: {
    backgroundColor: c.semantic.background,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[2],
  },
  header: {},
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
    backgroundColor: c.semantic.card,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border.default,
    alignSelf: 'center',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    gap: spacing[2],
  },
  verifyAccountBannerTextWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  verifyAccountBannerTitle: {
    ...textStyles.bodySmall,
    color: c.text.primary,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
  },
  verifyAccountBannerCta: {
    ...textStyles.bodySmall,
    color: c.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    flexShrink: 0,
  },
  headerAvatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: c.semantic.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  supportHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.semantic.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border.default,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing[3],
    flexGrow: 1,
    paddingBottom: scrollBottomPadding,
  },
  /** Sky-blue gradient hero — primary identity card. */
  heroCard: {
    marginHorizontal: spacing[5],
    marginBottom: spacing[3],
    borderRadius: borderRadius['3xl'],
    overflow: 'hidden',
    ...shadows.sm,
  },
  heroInner: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[5],
  },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[5],
  },
  /** White-on-blue currency pill: 15% white fill, white text/icon. */
  currencySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: 0,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: borderRadius.full,
    height: 40,
  },
  flagContainer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  flagImage: {
    width: 22,
    height: 22,
  },
  currencyText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  addFundsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.semantic.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  addFundsButtonSmall: {
    ...surfaceChromeCircleStyle(c, 40, { shadow: 'none' }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: c.background.primary,
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
    ...Platform.select({
      ios: {
        shadowColor: c.neutral.black,
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
    borderBottomColor: c.border.light,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text.primary,
    fontFamily: fontFamily.semibold,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.background.secondary,
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
    backgroundColor: c.primary.main + '10',
  },
  currencyItemInfo: {
    flex: 1,
  },
  currencyItemCode: {
    fontSize: 16,
    fontWeight: '600',
    color: c.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: 2,
  },
  currencyItemBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: c.text.primary,
    fontFamily: fontFamily.semibold,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.border.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    borderColor: c.primary.main,
    backgroundColor: c.primary.main,
  },
  checkboxInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.background.primary,
  },
  flagContainerSmall: {
    ...surfaceChromeCircleStyle(c, 24, { shadow: 'none' }),
    overflow: 'hidden',
  },
  flagImageSmall: {
    width: 24,
    height: 24,
  },
  currencyOptionText: {
    ...textStyles.bodyMedium,
    color: c.text.primary,
    fontFamily: fontFamily.medium,
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[6],
  },
  balanceAmount: {
    flex: 1,
    fontWeight: '700',
    letterSpacing: -1,
  },
  balanceSkeletonWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  hideBalanceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing[2],
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing[3],
  },
  heroReceiveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: '#FFFFFF',
  },
  heroReceiveLabel: {
    ...textStyles.labelLarge,
    color: c.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 15,
  },
  heroSendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  heroSendLabel: {
    ...textStyles.labelLarge,
    color: '#FFFFFF',
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 15,
  },
  heroBtnPressed: {
    opacity: 0.9,
  },
  transactionsBlock: {
    alignSelf: 'stretch',
    marginHorizontal: spacing[5],
    marginTop: spacing[2],
  },
  transactionsSection: {
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing[3],
  },
  transactionsTitle: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing[2],
    ...textStyles.titleMedium,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    color: c.text.primary,
    letterSpacing: -0.1,
  },
  viewAllButton: {
    flexShrink: 0,
    justifyContent: 'center',
  },
  viewAllText: {
    ...textStyles.labelMedium,
    color: c.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    minHeight: 64,
  },
  transactionItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border.light,
  },
  transactionItemPressed: {
    backgroundColor: c.semantic.muted,
    opacity: 0.85,
  },
  transactionItemLast: {
    marginBottom: 0,
  },
  /** Tinted-blue circular icon — primary @ ~10% alpha fill, primary stroke icon. */
  transactionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
    backgroundColor: 'rgba(0, 122, 204, 0.10)',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionName: {
    ...textStyles.bodyMedium,
    color: c.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    marginBottom: 2,
  },
  transactionDate: {
    ...textStyles.bodySmall,
    color: c.text.secondary,
    fontFamily: fontFamily.regular,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: spacing[2],
  },
  transactionAmount: {
    ...textStyles.bodyLarge,
    color: c.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  transactionAmountReceived: {
    color: c.primary.main,
  },
  transactionStatusText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[4],
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.semantic.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  emptyStateTitle: {
    ...textStyles.titleLarge,
    color: c.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[2],
  },
  emptyStateText: {
    ...textStyles.bodyMedium,
    color: c.text.secondary,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
  },
  skeletonContainer: {
    paddingHorizontal: 0,
  },
  })
}
