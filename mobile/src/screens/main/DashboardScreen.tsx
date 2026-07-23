import React, { useState, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { WebAwareModal } from '../../components/WebAwareModal'
import ShimmerLoader from '../../components/premium/ShimmerLoader'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  MessageCircle,
  ChevronDown,
  ChevronRight,
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
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
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
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import EmptyState from '../../components/EmptyState'
import { ListRowSkeleton } from '../../components/skeletons'
import { SectionCard } from '../../components/ui'
import { formatSignedCurrency, getTransactionStatusDisplay } from '../../utils/formatters'
import { initialsFromFullName } from '../../lib/userProfileHelpers'
import { isTier1Complete } from '../../lib/compliance'
import { noahService } from '../../lib/noahService'
import { useTransactionsList, prefetchRecentTransactionDetailsInBackground, prefetchTransactionDetail, TRANSACTIONS_LEDGER_PAGE_SIZE } from '../../hooks/queries'
import { prefetchReceiveDepositQueries } from '../../hooks/queries/use-receive-deposit-queries'
import {
  resolveWarmYcLocalDepositCorridor,
  warmYcLocalDepositCaches,
} from '../../lib/warmYcLocalDepositCaches'
import {
  markRecentMoneyActivity,
  qk,
} from '@easner/shared'
import { useRealtimeHealth } from '../../query/realtime-health-context'
import { useTransactionListFocusRefresh } from '../../hooks/use-transaction-list-focus-refresh'
import { invalidateTransactionsFeed } from '../../query/refresh-user-feeds'
import { getTransactionListName } from '../../lib/transactionListLabel'
import { AvatarImage } from '../../components/AvatarImage'
import { avatarImageUri, warmAvatarCache } from '../../lib/avatarCache'
import { buildGroupedActivityItems } from '../../lib/transactionListGrouping'
import { haptics } from '../../lib/haptics'
import { prepareTransactionDetailsNavigation } from '../../navigation/transactionNavParams'
import { useFixedFooterPadding, useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'

const DASHBOARD_SELECTED_CURRENCY_KEY_PREFIX = 'easner_dashboard_selected_currency_'
/** Recent activity rows shown on Home (UI only). Ledger fetch uses {@link TRANSACTIONS_LEDGER_PAGE_SIZE}. */
const DASHBOARD_RECENT_TX_LIMIT = 4
/** Hidden-balance + currency picker label (text). */
const DASHBOARD_BALANCE_PLACEHOLDER = '••••••'

// Transaction interface for dashboard
interface DashboardTransaction {
  id: string
  transaction_id: string
  ledger_row_id?: string
  type?: 'send' | 'receive'
  transaction_type?: 'send' | 'receive'
  amount: number
  currency: string
  account_impact_amount?: number
  account_impact_currency?: string
  ledger_amount?: number
  ledger_currency?: string
  name?: string
  display_description?: string
  status: string
  created_at: string
  noah_created_at?: string
  source_type?: string
  source_liquidation_address_id?: string
  metadata?: Record<string, unknown>
  payload?: Record<string, unknown>
  recipient?: { full_name?: string }
  sender_display_name?: string
}

export default function DashboardScreen({ navigation }: NavigationProps) {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  const { showSidebarShell } = useResponsiveLayout()
  const scrollBottomPadding = useScrollBottomPadding(spacing[4], { tabScreen: true })
  const footerPadding = useFixedFooterPadding(spacing[4])
  const styles = useMemo(
    () => createDashboardStyles(palette, scrollBottomPadding),
    [palette, scrollBottomPadding],
  )
  const heroBalanceFontSize = scaledFontSize(56)
  const heroBalanceLineHeight =
    Math.round(heroBalanceFontSize * lineHeight.tight) + (Platform.OS === 'android' ? 6 : 4)
  /** Shimmer only: ~width of a short `0.00` balance line (no `$` / `€` / `£` / digits shown). */
  const balanceCompactSkeletonMetrics = useMemo(() => {
    const width = Math.round(heroBalanceFontSize * 2.45)
    const height = Math.max(30, Math.round(heroBalanceFontSize * 0.54))
    const r = Math.max(6, Math.round(height * 0.15))
    return { width, height, borderRadius: r }
  }, [heroBalanceFontSize])
  const { user, userProfile, refreshUserProfile, loading: authLoading } = useAuth()
  const { scope } = useScope()
  const qc = useQueryClient()
  const txQuery = useTransactionsList({}, TRANSACTIONS_LEDGER_PAGE_SIZE)
  const realtimeHealth = useRealtimeHealth()
  const { balances, hasResolvedBalance, hasDefinitiveEmptyBalance, refreshBalances } = useBalance()
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
      if (chainLedgerSyncInFlightRef.current) {
        return chainLedgerSyncInFlightRef.current
      }

      const run = (async () => {
        try {
          const response = await apiPost('/api/wallets/sync-chain-ledger', undefined, {
            headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
          })
          if (!response.ok) return false
          const payload = await response.json().catch(() => null)
          if (!(payload as { skipped?: boolean })?.skipped) {
            lastDashboardChainLedgerSyncRef.current = Date.now()
          }
          const upserts = Number(
            (payload as any)?.result?.upserts ?? (payload as any)?.result?.upserted ?? 0,
          )
          const noahCredited = Number((payload as any)?.noahReconcile?.credited ?? 0)
          const ataSynced = (payload as any)?.balanceSync?.ok === true
          const inserted =
            ataSynced ||
            (Number.isFinite(upserts) && upserts > 0) ||
            (Number.isFinite(noahCredited) && noahCredited > 0)
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

  const recentTransactions = useMemo<DashboardTransaction[]>(() => {
    const firstPage = txQuery.data?.pages?.[0]?.transactions ?? []
    return (firstPage as DashboardTransaction[]).slice(0, DASHBOARD_RECENT_TX_LIMIT)
  }, [txQuery.data])
  const loadingTransactions = txQuery.isPending && recentTransactions.length === 0
  const hasAttemptedLoad = txQuery.isFetched
  const lastStableBalanceTextRef = useRef<Record<string, string>>({})
  /** Recent list + "All" row: reduce scroll end padding so the card sits closer to the tab bar. */
  const dashboardRecentListWithAllRow =
    !loadingTransactions && recentTransactions.length > 0

  useEffect(() => {
    if (!scope || recentTransactions.length === 0) return
    prefetchRecentTransactionDetailsInBackground(qc, scope, recentTransactions, 10)
  }, [qc, recentTransactions, scope])

  const warmReceiveLocalDeposit = useCallback(() => {
    const corridor = resolveWarmYcLocalDepositCorridor(userProfile, {
      kycApproved: isTier1Complete(userProfile),
    })
    if (!corridor) return
    void warmYcLocalDepositCaches(corridor)
  }, [userProfile])

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
      loadAvailableCurrencies().catch(() => {
        // Silently fail
      })
      void prefetchReceiveDepositQueries(qc, scope)
      warmReceiveLocalDeposit()
    }, [
      user?.id,
      userProfile,
      refreshUserProfile,
      refreshBalances,
      loadAvailableCurrencies,
      qc,
      scope,
      warmReceiveLocalDeposit,
    ])
  )

  // Gate ledger refetch on focus: skip when realtime is healthy (rows arrive via prepend).
  useTransactionListFocusRefresh({
    txQuery,
    realtimeHealth,
    onChainSync: syncChainLedgerIfDue,
  })

  const balanceRaw = (balances as Record<string, string | undefined>)[selectedCurrency]
  const hasBalanceForSelectedCurrency = typeof balanceRaw === 'string' && balanceRaw.trim().length > 0
  const balance = hasBalanceForSelectedCurrency ? parseFloat(balanceRaw as string) : 0
  const isWalletBalanceCurrency = selectedCurrency === 'USD' || selectedCurrency === 'EUR'
  // Snapshot first; $0.00 when balance is truly zero or server says wallet is empty (new user).
  const canRenderNumericBalance =
    hasResolvedBalance &&
    (hasBalanceForSelectedCurrency ||
      (hasDefinitiveEmptyBalance && isWalletBalanceCurrency))
  const resolvedBalanceText = canRenderNumericBalance
    ? formatBalanceDisplay(balance, selectedCurrency)
    : null
  if (resolvedBalanceText) {
    lastStableBalanceTextRef.current[selectedCurrency] = resolvedBalanceText
  }
  const visibleBalanceText = !balanceVisible
    ? DASHBOARD_BALANCE_PLACEHOLDER
    : resolvedBalanceText ??
      lastStableBalanceTextRef.current[selectedCurrency] ??
      null

  const shouldShowBalanceSkeleton = balanceVisible && !hasResolvedBalance

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

  const headerAvatarUri = avatarImageUri(userProfile?.profile?.avatar_url)

  useEffect(() => {
    warmAvatarCache(headerAvatarUri)
  }, [headerAvatarUri])

  const handleCurrencyChange = (currency: 'USD' | 'EUR' | 'GBP') => {
    setSelectedCurrency(currency)
    setShowCurrencyDropdown(false)
    haptics.tap()
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
    haptics.tap()
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

  const formatAmount = (amount: number, isReceived: boolean, currency: string = 'USD') =>
    formatSignedCurrency(amount, currency, isReceived)

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

  const getTransactionName = (transaction: DashboardTransaction): string =>
    getTransactionListName(transaction)

  const getTransactionIconType = (transaction: DashboardTransaction): string => {
    const transactionType = transaction.transaction_type || transaction.type
    if (transactionType === 'receive') return 'inbox'
    // Could add more logic here based on transaction metadata
    return 'outbox'
  }

  const dashboardTxSegments = useMemo(() => {
    const items = buildGroupedActivityItems(recentTransactions)
    type Seg =
      | { kind: 'header'; key: string; label: string; isFirst: boolean }
      | { kind: 'row'; key: string; transaction: DashboardTransaction; isLast: boolean }
    const out: Seg[] = []
    let firstHeader = true
    let rowIndex = 0
    const total = recentTransactions.length
    for (const it of items) {
      if (it.kind === 'header') {
        out.push({ kind: 'header', key: it.key, label: it.label, isFirst: firstHeader })
        firstHeader = false
      } else {
        for (const tx of it.rows) {
          out.push({
            kind: 'row',
            key: `r-${tx.id || tx.transaction_id}-${rowIndex}`,
            transaction: tx,
            isLast: rowIndex === total - 1,
          })
          rowIndex++
        }
      }
    }
    return out
  }, [recentTransactions])

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
    const estimatedHeight = headerHeight + (itemHeight * availableCurrencies.length) + padding + footerPadding

  return (
      <WebAwareModal
        visible={showCurrencyDropdown}
        onRequestClose={() => setShowCurrencyDropdown(false)}
        compact
        nativePanelStyle={{
          maxHeight: estimatedHeight,
          paddingBottom: footerPadding,
        }}
        webPanelStyle={{ maxHeight: estimatedHeight }}
      >
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
                  : DASHBOARD_BALANCE_PLACEHOLDER
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
                      haptics.tap()
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
      </WebAwareModal>
    )
  }

  const showInScreenChrome = !showSidebarShell
  const showDashboardHeader = showInScreenChrome || showVerifyIdentityBanner

  return (
    <View style={styles.container}>
      {/* Header: avatar | verify banner (if needed) | support — avatar/support stay in-screen on small; web shell moves them to DesktopHeader */}
      {showDashboardHeader ? (
      <View style={[styles.headerWrapper, { paddingTop: insets.top + spacing[4] }]}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            {showInScreenChrome ? (
            <View style={styles.greetingContainer}>
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.headerAvatarButton}
                onPress={async () => {
                  haptics.tap()
                  navigation.navigate('Profile' as any)
                }} >
                {headerAvatarUri ? (
                  <AvatarImage
                    avatarUrl={userProfile?.profile?.avatar_url}
                    style={userAvatarStyles.image}
                  />
                ) : (
                  <Text style={userAvatarStyles.initials}>
                    {initialsFromFullName(dashboardAvatarFullName)}
                  </Text>
                )}
              </Pressable>
            </View>
            ) : (
              <View style={styles.headerSideSlot} />
            )}

            {showVerifyIdentityBanner ? (
              <View style={styles.verifyAccountBannerSlot}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.verifyAccountBanner}
                  onPress={() => {
                    haptics.tap()
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

            {showInScreenChrome ? (
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.supportHeaderButton}
              onPress={() => {
                haptics.tap()
                const parent = navigation.getParent?.()
                if (parent?.navigate) {
                  parent.navigate('Support' as never)
                } else {
                  navigation.navigate('Support' as never)
                }
              }} accessibilityRole="button"
              accessibilityLabel="Support"
            >
              <MessageCircle size={22} color={palette.primary.main} strokeWidth={2} />
            </Pressable>
            ) : (
              <View style={styles.headerSideSlot} />
            )}
          </View>
        </View>
      </View>
      ) : null}

      {/* Balance hero + quick actions */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          dashboardRecentListWithAllRow ? styles.scrollContentTabBarTight : null,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={async () => {
              setRefreshing(true)
              try {
                haptics.tap()
                const uid = userProfile?.id || user?.id
                void syncChainLedgerIfDue(true).then((inserted) => {
                  if (inserted && uid && scope) {
                    void invalidateTransactionsFeed(qc, scope, uid)
                  }
                })
                await Promise.all([
                  refreshBalances(true),
                  uid && scope
                    ? invalidateTransactionsFeed(qc, scope, uid)
                    : txQuery.refetch(),
                ])
              } catch (error) {
                console.error('Error refreshing dashboard:', error)
              } finally {
                setRefreshing(false)
                haptics.select()
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
                haptics.tap()
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
              <View
                accessibilityLabel="Loading balance"
                accessible
                style={[
                  styles.balanceAmount,
                  styles.balanceCompactSkeletonSlot,
                  { minHeight: heroBalanceLineHeight },
                ]}
              >
                <ShimmerLoader
                  width={balanceCompactSkeletonMetrics.width}
                  height={balanceCompactSkeletonMetrics.height}
                  borderRadius={balanceCompactSkeletonMetrics.borderRadius}
                  style={styles.balanceCompactSkeletonShimmer}
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
              onPressIn={warmReceiveLocalDeposit}
              onPress={() => {
                haptics.tap()
                // Navigate immediately — never block Receive on YC rails/rates warmup.
                warmReceiveLocalDeposit()
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
                haptics.tap()
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
        
        <View style={styles.transactionsBlock}>
          <SectionCard style={styles.transactionsSection} flush>
          {!loadingTransactions && recentTransactions.length > 0 && (
            <View style={styles.transactionsHeader}>
              <Text style={styles.transactionsTitle} numberOfLines={1}>
                Recent Transactions
              </Text>
              <Pressable
                android_ripple={ripple.primaryTint}
                style={({ pressed }) => [styles.viewAllButton, pressed && styles.viewAllButtonPressed]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => {
                  haptics.tap()
                  navigation.navigate('Transactions' as never)
                }}
                accessibilityRole="button"
                accessibilityLabel="All transactions"
              >
                <View style={styles.viewAllInner}>
                  <Text style={styles.viewAllText}>All</Text>
                  <ChevronRight size={16} color={palette.primary.main} strokeWidth={2.25} />
                </View>
              </Pressable>
            </View>
          )}
          {/* Transaction List */}
          {loadingTransactions ? (
            <View style={styles.skeletonContainer}>
              {Array.from({ length: DASHBOARD_RECENT_TX_LIMIT }, (_, i) => (
                <ListRowSkeleton
                  key={i}
                  variant="transaction"
                  showDivider={i < DASHBOARD_RECENT_TX_LIMIT - 1}
                />
              ))}
            </View>
          ) : recentTransactions.length === 0 && hasAttemptedLoad ? (
            <EmptyState
              icon={Receipt}
              title="No transactions yet"
              message="Your recent transactions will appear here once you send, receive or spend money"
              action={{
                label: 'Send money',
                onPress: () => {
                  navigation.navigate('SelectRecentRecipient' as never, {
                    preferredBalanceCurrency:
                      selectedCurrency === 'USD' || selectedCurrency === 'EUR'
                        ? selectedCurrency
                        : undefined,
                  } as never)
                },
              }}
            />
          ) : (
            <View>
              {dashboardTxSegments.map((seg) => {
                if (seg.kind === 'header') {
                  return (
                    <Text
                      key={seg.key}
                      style={[styles.txDateHeader, seg.isFirst ? styles.txDateHeaderFirst : null]}
                    >
                      {seg.label}
                    </Text>
                  )
                }
                const transaction = seg.transaction
                const txType = transaction.transaction_type || transaction.type
                const isReceived = txType === 'receive'
                const iconType = getTransactionIconType(transaction)
                const statusDisplay = getTransactionStatusDisplay(
                  transaction.status,
                  (transaction as { status_label?: string }).status_label,
                )
                return (
                  <Pressable
                    android_ripple={ripple.neutral}
                    key={seg.key}
                    style={({ pressed }) => [
                      styles.transactionItem,
                      !seg.isLast && styles.transactionItemDivider,
                      pressed && styles.transactionItemPressed,
                    ]}
                    onPress={() => {
                      haptics.tap()
                      navigation.navigate(
                        'TransactionDetails' as never,
                        prepareTransactionDetailsNavigation({
                          transactionId:
                            transaction.ledger_row_id?.trim() || transaction.transaction_id,
                          fromScreen: 'Dashboard',
                          initialTransaction: transaction,
                        }) as never,
                      )
                    }}
                    onPressIn={() => {
                      if (!scope) return
                      const txId = String(
                        transaction.ledger_row_id?.trim() || transaction.transaction_id || transaction.id || '',
                      ).trim()
                      if (!txId) return
                      void prefetchTransactionDetail(qc, scope, txId)
                    }}
                  >
                    {getTransactionIcon(iconType, isReceived)}
                    <View style={styles.transactionDetails}>
                      <Text style={styles.transactionName} numberOfLines={1}>
                        {getTransactionName(transaction)}
                      </Text>
                      <Text style={styles.transactionDate} numberOfLines={1}>
                        {formatTransactionDate(
                          (transaction as { display_when_at?: string }).display_when_at ||
                            transaction.noah_created_at ||
                            transaction.created_at,
                        )}
                      </Text>
                    </View>
                    <View style={styles.transactionAmountContainer}>
                      <Text
                        style={[
                          styles.transactionAmount,
                          isReceived && styles.transactionAmountReceived,
                        ]}
                      >
                        {formatAmount(
                          transaction.amount,
                          isReceived,
                          transaction.currency,
                        )}
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
  /** Keeps the verify banner centered when avatar/support live in the desktop header. */
  headerSideSlot: {
    width: 40,
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
  /** When Home shows recent transactions + All, pull content closer to the docked tab bar. */
  scrollContentTabBarTight: {
    paddingBottom: spacing[4],
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
    borderRadius: 11,
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
    borderRadius: 12,
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
  balanceCompactSkeletonSlot: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  balanceCompactSkeletonShimmer: {
    backgroundColor: 'rgba(255,255,255,0.22)',
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
    paddingTop: spacing[3],
    paddingHorizontal: spacing[4],
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
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 122, 204, 0.08)',
  },
  viewAllInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  viewAllButtonPressed: {
    opacity: 0.9,
  },
  viewAllText: {
    ...textStyles.labelMedium,
    color: c.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 16,
    textAlignVertical: 'center',
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  txDateHeader: {
    fontSize: 11,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    color: c.text.secondary,
    letterSpacing: 0.6,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  txDateHeaderFirst: {
    paddingTop: spacing[2],
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
