import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  RefreshControl,
  TextInput,
  Animated,
  ScrollView,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import DateTimePicker from '@react-native-community/datetimepicker'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar as CalendarIcon,
  CreditCard,
  Search,
  CircleX,
  Receipt,
} from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { PremiumModalSheet } from '../../components/premium'
import { GroupedListCardSkeleton } from '../../components/skeletons'
import EmptyState from '../../components/EmptyState'
import { FilterChip, SectionCard } from '../../components/ui'
import { useCurrenciesCatalog, useTransactionsList, prefetchRecentTransactionDetailsInBackground, prefetchTransactionDetail, TRANSACTIONS_LEDGER_PAGE_SIZE } from '../../hooks/queries'
import { NavigationProps, Transaction } from '../../types'
import { analytics } from '../../lib/analytics'
import { useBalance } from '../../contexts/BalanceContext'
import { useFocusRefreshAll } from '../../hooks/useFocusRefresh'
import { useQueryClient } from '@tanstack/react-query'
import { useScope } from '../../query/scope'
import { apiFetch } from '../../query/api-client'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import {
  colors,
  textStyles,
  borderRadius,
  spacing,
  shadows,
  motion,
  shouldPlayDecorativeMotionEnter,
  scaledFontSize,
  fontFamily,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { buildGroupedActivityItems } from '../../lib/transactionListGrouping'
import { formatSignedCurrency, getTransactionStatusDisplay } from '../../utils/formatters'
import {
  markRecentMoneyActivity,
  qk,
} from '@easner/shared'
import { getTransactionListName } from '../../lib/transactionListLabel'
import { apiPost } from '../../lib/apiClient'
import { useAuth } from '../../contexts/AuthContext'
import { haptics } from '../../lib/haptics'
import { prepareTransactionDetailsNavigation } from '../../navigation/transactionNavParams'
import { useRealtimeHealth } from '../../query/realtime-health-context'
import { useTransactionListFocusRefresh } from '../../hooks/use-transaction-list-focus-refresh'
import { useSplitPaneConfig } from '../../components/layout/SplitPane'

import {
  TRANSACTIONS_CACHE_KEY_PREFIX,
  DASHBOARD_RECENT_TX_CACHE_TTL_MS as TRANSACTIONS_CACHE_TTL_MS,
} from '../../lib/background-feed-cache-keys'

function useCurrencies() {
  const { data: currencies = [] } = useCurrenciesCatalog()
  return currencies || []
}

interface CombinedTransaction {
  id: string
  transaction_id: string
  ledger_row_id?: string
  type: 'send' | 'receive' | 'card_funding'
  transaction_type?: 'send' | 'receive' // Bridge transactions use transaction_type
  status: string
  created_at: string
  noah_created_at?: string
  send_amount?: number
  send_currency?: string
  receive_amount?: number
  receive_currency?: string
  recipient?: {
    full_name: string
    account_number: string
    bank_name: string
  }
  crypto_amount?: number
  crypto_currency?: string
  fiat_amount?: number
  fiat_currency?: string
  receipt_destination_tx_hash?: string // Bridge transaction receipt hash
  crypto_wallet?: {
    wallet_address: string
    crypto_currency: string
  }
  destination_type?: 'bank' | 'card'
  amount?: number
  currency?: string
  merchant_name?: string
  description?: string
  direction?: 'credit' | 'debit'
  name?: string
  source_type?: string // 'virtual_account', 'liquidation_address', etc.
  source_liquidation_address_id?: string
  metadata?: any
}

/** Prefer ledger UUID for detail API — list `transaction_id` may be display-only (ETID…). */
function transactionDetailLookupId(row: Pick<CombinedTransaction, 'ledger_row_id' | 'transaction_id' | 'id'>) {
  const ledger = typeof row.ledger_row_id === 'string' ? row.ledger_row_id.trim() : ''
  if (ledger) return ledger
  return String(row.transaction_id || row.id || '')
}

type ActivityFilter = 'all' | 'in' | 'out' | 'card'

const ACTIVITY_FILTERS: ReadonlyArray<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'Money in' },
  { id: 'out', label: 'Money out' },
  { id: 'card', label: 'Card' },
]

function isCardTransaction(tx: CombinedTransaction): boolean {
  const txType = String(tx.transaction_type || tx.type || '').toLowerCase()
  if (txType === 'card_funding' || txType === 'card') return true
  if (String(tx.destination_type || '').toLowerCase() === 'card') return true
  if (String(tx.source_type || '').toLowerCase() === 'card') return true
  const kind = String((tx.metadata as any)?.kind || '').toLowerCase()
  if (kind === 'card' || kind === 'card_funding') return true
  return false
}

function matchesActivityFilter(tx: CombinedTransaction, filter: ActivityFilter): boolean {
  if (filter === 'all') return true
  const txType = tx.transaction_type || tx.type
  if (filter === 'in') return txType === 'receive'
  if (filter === 'out') return txType === 'send'
  if (filter === 'card') return isCardTransaction(tx)
  return true
}

function statusToneTextStyle(tone: string) {
  switch (tone) {
    case 'completed':
      return { color: colors.success.main }
    case 'pending':
    case 'processing':
      return { color: colors.warning.main }
    case 'failed':
      return { color: colors.error.main }
    default:
      return { color: colors.text.secondary }
  }
}

function startOfDay(d: Date): Date {
  const next = new Date(d)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(d: Date): Date {
  const next = new Date(d)
  next.setHours(23, 59, 59, 999)
  return next
}

function formatRangeLabel(from: Date | null, to: Date | null): string {
  const fmt = (d: Date) =>
    `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()}`
  if (from && to) return `${fmt(from)} – ${fmt(to)}`
  if (from) return `From ${fmt(from)}`
  if (to) return `Until ${fmt(to)}`
  return ''
}

function getTransactionName(item: CombinedTransaction, transactionType: string): string {
  return getTransactionListName({
    ...item,
    transaction_type: transactionType,
  })
}

// Animated Transaction Item Component
const TransactionItem = React.memo(function TransactionItem({ 
  item, 
  index, 
  isLast,
  onPress,
  onPrefetch,
  formatAmount,
  formatDate,
  skipRowEntranceAnim,
}: { 
  item: CombinedTransaction
  index: number
  isLast: boolean
  onPress: () => void
  onPrefetch?: () => void
  formatAmount: (amount: number, currency: string, isReceived?: boolean) => string
  formatDate: (dateString: string) => string
  skipRowEntranceAnim: boolean
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current
  const slideAnim = useRef(new Animated.Value(motion.listRowTranslateY)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (skipRowEntranceAnim) {
      slideAnim.setValue(0)
      opacityAnim.setValue(1)
      return
    }
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: motion.listRowEnterMs,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: motion.listRowEnterMs,
        useNativeDriver: true,
      }),
    ]).start()
  }, [slideAnim, opacityAnim, skipRowEntranceAnim])

  const handlePressIn = () => {
    onPrefetch?.()
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start()
  }

  // Noah-backed rows use `transaction_type`; older `transactions` rows use `type`.
  const transactionType = item.transaction_type || item.type || 'send'
  const statusDisplay = getTransactionStatusDisplay(item.status)

  const getTransactionIcon = () => {
    const iconColor = colors.primary.main

    switch (transactionType) {
      case 'send':
        return (
          <View style={styles.transactionIconBox}>
            <ArrowUpRight size={18} color={iconColor} strokeWidth={2.5} />
          </View>
        )
      case 'receive':
        return (
          <View style={styles.transactionIconBox}>
            <ArrowDownLeft size={18} color={iconColor} strokeWidth={2.5} />
          </View>
        )
      case 'card_funding':
        return (
          <View style={styles.transactionIconBox}>
            <CreditCard size={18} color={iconColor} strokeWidth={2.5} />
          </View>
        )
      default:
        return (
          <View style={styles.transactionIconBox}>
            <ArrowUpRight size={18} color={iconColor} strokeWidth={2.5} />
          </View>
        )
    }
  }

  return (
    <Animated.View
      style={{
        transform: [
          { translateY: slideAnim },
          { scale: scaleAnim }
        ],
        opacity: opacityAnim,
      }}
    >
      <Pressable
       android_ripple={ripple.neutral}
        style={({ pressed }) => [
          styles.transactionItem,
          !isLast && styles.transactionItemDivider,
          pressed && styles.transactionItemPressed,
        ]}
        onPress={async () => {
          haptics.tap()
          onPress()
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut} >
        {getTransactionIcon()}
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionName} numberOfLines={1}>
            {getTransactionName(item, transactionType)}
          </Text>
          <Text style={styles.transactionDate} numberOfLines={1}>
            {formatDate(item.noah_created_at || item.created_at)}
          </Text>
        </View>
        <View style={styles.transactionAmountContainer}>
          <Text
            style={[
              styles.transactionAmount,
              transactionType === 'receive' && styles.transactionAmountReceived,
            ]}
          >
            {formatAmount(
              item.amount || item.send_amount || item.crypto_amount || item.fiat_amount || 0,
              item.currency || item.send_currency || item.crypto_currency || item.fiat_currency || 'USD',
              transactionType === 'receive'
            )}
          </Text>
          {statusDisplay ? (
            <Text style={[styles.transactionStatusText, statusToneTextStyle(statusDisplay.tone)]}>
              {statusDisplay.label}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
})
function TransactionsSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <GroupedListCardSkeleton rowCount={5} variant="transaction" />
    </View>
  )
}

function TransactionsContent({ navigation }: NavigationProps) {
  const { width: windowWidth } = useWindowDimensions()
  const { regularWidth, config: splitConfig } = useSplitPaneConfig()
  const { refreshBalances } = useBalance()
  const { user, userProfile } = useAuth()
  const { scope } = useScope()
  const qc = useQueryClient()
  const currencies = useCurrencies()
  const txQuery = useTransactionsList({}, TRANSACTIONS_LEDGER_PAGE_SIZE)
  const realtimeHealth = useRealtimeHealth()
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = txQuery
  const loadMoreInFlightRef = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('all')
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: null,
    to: null,
  })
  const [dateSheetOpen, setDateSheetOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState<Date | null>(null)
  const [draftTo, setDraftTo] = useState<Date | null>(null)
  const [draftPickerOpen, setDraftPickerOpen] = useState<null | 'from' | 'to'>(null)
  const lastChainLedgerSyncRef = useRef(0)
  const chainLedgerSyncInFlightRef = useRef<Promise<boolean> | null>(null)
  
  const headerAnim = useRef(new Animated.Value(0)).current
  const [skipRowEntranceAnim, setSkipRowEntranceAnim] = useState(false)

  useCalmParallelEnterWhen(true, headerAnim)

  useEffect(() => {
    void shouldPlayDecorativeMotionEnter().then((play) => setSkipRowEntranceAnim(!play))
  }, [])

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('Transactions')
  }, [])

  const queryRows = useMemo<CombinedTransaction[]>(() => {
    const pages = txQuery.data?.pages ?? []
    return pages.flatMap((p) => (p.transactions ?? []) as CombinedTransaction[])
  }, [txQuery.data])
  const [cachedRows, setCachedRows] = useState<CombinedTransaction[]>([])
  const transactions = queryRows.length > 0 ? queryRows : cachedRows
  const loading = txQuery.isPending && transactions.length === 0

  useEffect(() => {
    const uid = userProfile?.id || user?.id
    if (!uid) return
    const key = `${TRANSACTIONS_CACHE_KEY_PREFIX}${uid}`
    let mounted = true
    const loadCachedTransactions = async () => {
      try {
        const raw = await AsyncStorage.getItem(key)
        if (!raw) return
        const parsed = JSON.parse(raw) as { at?: number; rows?: CombinedTransaction[] } | null
        const at = Number(parsed?.at ?? 0)
        const rows = Array.isArray(parsed?.rows) ? parsed?.rows : []
        if (!Number.isFinite(at) || Date.now() - at > TRANSACTIONS_CACHE_TTL_MS) return
        if (mounted && rows.length > 0) {
          setCachedRows(rows.slice(0, 200))
        }
      } catch {
        // Ignore malformed cache.
      }
    }
    void loadCachedTransactions()
    return () => {
      mounted = false
    }
  }, [userProfile?.id, user?.id])

  useEffect(() => {
    const uid = userProfile?.id || user?.id
    if (!uid) return
    if (queryRows.length === 0) return
    const key = `${TRANSACTIONS_CACHE_KEY_PREFIX}${uid}`
    const payload = JSON.stringify({
      at: Date.now(),
      rows: queryRows.slice(0, 200),
    })
    AsyncStorage.setItem(key, payload).catch(() => {
      // Ignore storage write failures.
    })
  }, [queryRows, userProfile?.id, user?.id])

  useEffect(() => {
    if (!scope || queryRows.length === 0) return
    prefetchRecentTransactionDetailsInBackground(qc, scope, queryRows, 30)
  }, [qc, queryRows, scope])

  // Refresh stale data when screen comes into focus
  useFocusRefreshAll(false) // Only refresh if stale (> 5 minutes)

  const syncChainLedgerIfDue = React.useCallback(
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
            lastChainLedgerSyncRef.current = Date.now()
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

  useTransactionListFocusRefresh({
    txQuery,
    realtimeHealth,
    onChainSync: syncChainLedgerIfDue,
  })

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      haptics.tap()
      // Chain sync can take many seconds — don't block the spinner; refresh ledger after if it inserted rows.
      void syncChainLedgerIfDue(true).then((inserted) => {
        if (inserted) void txQuery.refetch()
      })
      await Promise.all([refreshBalances(true), txQuery.refetch()])
    } catch (error: any) {
      if (error?.message?.includes('Network request failed') || error?.name === 'TypeError') {
        console.warn("Network error refreshing transactions:", error?.message || 'Network unavailable')
      } else {
        console.error("Error refreshing transactions:", error)
      }
    } finally {
      setRefreshing(false)
      haptics.select()
    }
  }

  const handleScrollLoadMore = (event: {
    nativeEvent: { layoutMeasurement: { height: number }; contentOffset: { y: number }; contentSize: { height: number } }
  }) => {
    if (!hasNextPage || isFetchingNextPage || loadMoreInFlightRef.current) return
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y
    if (distanceFromBottom > 320) return
    loadMoreInFlightRef.current = true
    void fetchNextPage().finally(() => {
      loadMoreInFlightRef.current = false
    })
  }

  const formatAmount = (amount: number, currency: string, isReceived: boolean = false) =>
    formatSignedCurrency(amount, currency, isReceived)

  const formatDate = (dateString: string) => {
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

  const dateRangeBounds = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return null
    const fromMs = dateRange.from ? startOfDay(dateRange.from).getTime() : Number.NEGATIVE_INFINITY
    const toMs = dateRange.to ? endOfDay(dateRange.to).getTime() : Number.POSITIVE_INFINITY
    return { fromMs, toMs }
  }, [dateRange.from, dateRange.to])

  const transactionsInRange = useMemo(() => {
    if (!dateRangeBounds) return transactions
    return transactions.filter((tx) => {
      if (!tx) return false
      const dateStr = tx.noah_created_at || tx.created_at
      if (!dateStr) return false
      const ms = new Date(dateStr).getTime()
      return ms >= dateRangeBounds.fromMs && ms <= dateRangeBounds.toMs
    })
  }, [transactions, dateRangeBounds])

  const filteredTransactions = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase()
    return transactionsInRange.filter((transaction) => {
      if (!transaction) return false
      if (!matchesActivityFilter(transaction, activeFilter)) return false
      if (!searchLower) return true
      const txType = transaction.transaction_type || transaction.type
      return (
        (transaction.transaction_id || transaction.id)?.toLowerCase().includes(searchLower) ||
        transaction.name?.toLowerCase().includes(searchLower) ||
        (txType === 'send' &&
          transaction.recipient?.full_name?.toLowerCase().includes(searchLower)) ||
        (txType === 'receive' &&
          (transaction.receipt_destination_tx_hash?.toLowerCase().includes(searchLower) ||
           transaction.crypto_wallet?.wallet_address?.toLowerCase().includes(searchLower)))
      )
    })
  }, [transactionsInRange, searchTerm, activeFilter])

  /** Same basis as the list: date range + search + All / Money in / Money out / Card (business sums credits+debits from its filtered set). */
  const summaryTotals = useMemo(() => {
    let inAmount = 0
    let outAmount = 0
    let inCurrency: string | null = null
    let outCurrency: string | null = null
    for (const tx of filteredTransactions) {
      if (!tx) continue
      const dateStr = tx.noah_created_at || tx.created_at
      if (!dateStr) continue
      const txType = tx.transaction_type || tx.type
      const amt = Math.abs(
        Number(
          txType === 'send' || txType === 'card_funding'
            ? (tx.ledger_amount ?? tx.amount ?? tx.send_amount ?? tx.crypto_amount ?? tx.fiat_amount ?? 0)
            : (tx.display_amount ?? tx.amount ?? tx.send_amount ?? tx.crypto_amount ?? tx.fiat_amount ?? 0),
        ) || 0,
      )
      const cur =
        txType === 'send' || txType === 'card_funding'
          ? (tx.ledger_currency ??
            tx.currency ??
            tx.send_currency ??
            tx.crypto_currency ??
            tx.fiat_currency ??
            'USD')
          : (tx.display_currency ??
            tx.currency ??
            tx.send_currency ??
            tx.crypto_currency ??
            tx.fiat_currency ??
            'USD')
      if (txType === 'receive') {
        inAmount += amt
        if (!inCurrency) inCurrency = cur
      } else if (txType === 'send' || txType === 'card_funding') {
        outAmount += amt
        if (!outCurrency) outCurrency = cur
      }
    }
    return {
      inAmount,
      outAmount,
      inCurrency: inCurrency || 'USD',
      outCurrency: outCurrency || inCurrency || 'USD',
    }
  }, [filteredTransactions])

  const groupedItems = useMemo(
    () => buildGroupedActivityItems(filteredTransactions),
    [filteredTransactions],
  )

  useEffect(() => {
    if (!regularWidth) return
    if (filteredTransactions.length === 0) {
      setSelectedTransactionId(null)
      return
    }
    if (
      !selectedTransactionId ||
      !filteredTransactions.some((tx) => transactionDetailLookupId(tx) === selectedTransactionId)
    ) {
      setSelectedTransactionId(
        filteredTransactions[0] ? transactionDetailLookupId(filteredTransactions[0]) : null,
      )
    }
  }, [filteredTransactions, regularWidth, selectedTransactionId])

  const selectedTransaction =
    regularWidth && selectedTransactionId
      ? filteredTransactions.find((tx) => transactionDetailLookupId(tx) === selectedTransactionId) || null
      : null


  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Header */}
        <Animated.View 
          style={[
            styles.header,
            {
              opacity: headerAnim,
              transform: [{
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-motion.screenEnterTranslateY, 0],
                })
              }]
            }
          ]}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title}>Transactions</Text>
            </View>
            <Pressable
              android_ripple={ripple.neutral}
              onPress={async () => {
                haptics.tap()
                setDraftFrom(dateRange.from)
                setDraftTo(dateRange.to)
                setDateSheetOpen(true)
              }}
              style={({ pressed }) => [
                styles.headerIconButton,
                dateRange.from || dateRange.to ? styles.headerIconButtonActive : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Filter by date range"
            >
              <CalendarIcon
                size={22}
                color={dateRange.from || dateRange.to ? colors.text.inverse : colors.primary.main}
                strokeWidth={2}
              />
            </Pressable>
          </View>
        </Animated.View>

        {dateRange.from || dateRange.to ? (
          <View style={styles.rangeChipRow}>
            <View style={styles.rangeChip}>
              <CalendarIcon size={14} color={colors.primary.main} strokeWidth={2} />
              <Text style={styles.rangeChipText} numberOfLines={1}>
                {formatRangeLabel(dateRange.from, dateRange.to)}
              </Text>
              <Pressable
                android_ripple={ripple.neutral}
                onPress={async () => {
                  await haptics.select()
                  setDateRange({ from: null, to: null })
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear date range"
                hitSlop={8}
              >
                <CircleX size={16} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        ) : null}

      {/* Single scroll surface: summary + search + filters + list */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: spacing[8] },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScrollLoadMore}
        scrollEventThrottle={200}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary.main}
          />
        }
      >
        {/* Money in / Money out — totals match filtered list (search + chips + date range), same idea as business */}
        <View style={styles.summaryRow}>
          <SectionCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>MONEY IN</Text>
            <Text style={[styles.summaryValue, styles.summaryValueIn]} numberOfLines={1}>
              {`+${formatAmount(summaryTotals.inAmount, summaryTotals.inCurrency, true).replace(/^\+/, '')}`}
            </Text>
          </SectionCard>
          <SectionCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>MONEY OUT</Text>
            <Text style={styles.summaryValue} numberOfLines={1}>
              {summaryTotals.outAmount > 0
                ? `-${formatAmount(summaryTotals.outAmount, summaryTotals.outCurrency, false).replace(/^\-/, '')}`
                : formatAmount(0, summaryTotals.outCurrency, false)}
            </Text>
          </SectionCard>
        </View>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchWrapper}>
            <Search size={18} color={colors.primary.main} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search transactions"
              placeholderTextColor={colors.text.secondary}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {searchTerm.length > 0 ? (
              <Pressable android_ripple={ripple.neutral} onPress={() => setSearchTerm('')}>
                <CircleX size={18} color={colors.text.secondary} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {ACTIVITY_FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              selected={activeFilter === f.id}
              onPress={() => setActiveFilter(f.id)}
            />
          ))}
        </View>
        <View
          style={
            regularWidth
              ? [styles.transactionsSplitContainer, { maxWidth: splitConfig.maxWidth }]
              : styles.transactionsContainer
          }
        >
          {loading ? (
            <TransactionsSkeleton />
          ) : filteredTransactions.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={
                searchTerm || activeFilter !== 'all' ? 'No transactions found' : 'No transactions yet'
              }
              message={
                searchTerm || activeFilter !== 'all'
                  ? 'Try adjusting your search or filter to see more transactions'
                  : 'Your recent transactions will appear here once you send, receive or spend money'
              }
              action={
                !searchTerm && activeFilter === 'all'
                  ? {
                      label: 'Send money',
                      onPress: () => navigation.navigate('SelectRecentRecipient' as never),
                    }
                  : undefined
              }
              style={styles.emptyStateContainer}
            />
          ) : (
            <View style={regularWidth ? [styles.regularWidthRow, { gap: splitConfig.gap }] : undefined}>
              <View
                style={
                  regularWidth ? [styles.regularWidthListPane, { flex: splitConfig.listFlex }] : undefined
                }
              >
                {groupedItems.map((item, index) => {
                  if (item.kind === 'header') {
                    return (
                      <Text
                        key={item.key}
                        style={[
                          styles.dateHeader,
                          index === 0 ? styles.dateHeaderFirst : null,
                        ]}
                      >
                        {item.label}
                      </Text>
                    )
                  }
                  return (
                    <View key={item.key} style={styles.groupCard}>
                      {item.rows.map((tx, rowIdx) => {
                        const isLast = rowIdx === item.rows.length - 1
                        return (
                          <View
                            key={`${item.key}-${rowIdx}`}
                            style={!isLast ? styles.groupRowDivider : null}
                          >
                            <TransactionItem
                              item={tx}
                              index={rowIdx}
                              isLast={isLast}
                              skipRowEntranceAnim={skipRowEntranceAnim}
                              onPrefetch={() => {
                                if (!scope) return
                                const lookupId = transactionDetailLookupId(tx)
                                if (!lookupId) return
                                void prefetchTransactionDetail(qc, scope, lookupId)
                              }}
                              onPress={() => {
                                const lookupId = transactionDetailLookupId(tx)
                                if (regularWidth) {
                                  setSelectedTransactionId(lookupId)
                                  return
                                }
                                navigation.navigate(
                                  'TransactionDetails' as never,
                                  prepareTransactionDetailsNavigation({
                                    transactionId: lookupId,
                                    fromScreen: 'Transactions',
                                    initialTransaction: tx,
                                  }) as never,
                                )
                              }}
                              formatAmount={formatAmount}
                              formatDate={formatDate}
                            />
                          </View>
                        )
                      })}
                    </View>
                  )
                })}
                {hasNextPage && isFetchingNextPage ? (
                  <View style={styles.loadMoreRow}>
                    <Text style={styles.loadMoreText}>Loading more…</Text>
                  </View>
                ) : null}
              </View>
              {regularWidth ? (
                <View
                  style={[
                    styles.regularWidthDetailPane,
                    { flex: splitConfig.detailFlex, padding: splitConfig.detailPadding },
                  ]}
                >
                  {selectedTransaction ? (
                    <>
                      <Text style={[styles.regularWidthDetailTitle, { fontSize: splitConfig.titleSize }]}>
                        Transaction Preview
                      </Text>
                      <Text
                        style={[
                          styles.regularWidthDetailName,
                          {
                            fontSize: splitConfig.nameSize,
                            lineHeight: Math.round(splitConfig.nameSize * 1.25),
                          },
                        ]}
                      >
                        {getTransactionName(
                          selectedTransaction,
                          selectedTransaction.transaction_type || selectedTransaction.type || 'send',
                        )}
                      </Text>
                      <Text
                        style={[
                          styles.regularWidthDetailMeta,
                          {
                            fontSize: splitConfig.metaSize,
                            lineHeight: Math.round(splitConfig.metaSize * 1.4),
                          },
                        ]}
                      >
                        {formatDate(selectedTransaction.created_at)}
                      </Text>
                      <Text
                        style={[
                          styles.regularWidthDetailAmount,
                          {
                            fontSize: splitConfig.amountSize,
                            lineHeight: Math.round(splitConfig.amountSize * 1.2),
                          },
                        ]}
                      >
                        {formatAmount(
                          selectedTransaction.send_amount || selectedTransaction.amount || 0,
                          selectedTransaction.send_currency || selectedTransaction.currency || 'USD',
                          (selectedTransaction.transaction_type || selectedTransaction.type) === 'receive',
                        )}
                      </Text>
                      <Pressable
                        android_ripple={ripple.neutral}
                        style={styles.regularWidthDetailButton}
                        onPress={() =>
                          navigation.navigate(
                            'TransactionDetails' as never,
                            prepareTransactionDetailsNavigation({
                              transactionId: transactionDetailLookupId(selectedTransaction),
                              fromScreen: 'Transactions',
                              initialTransaction: selectedTransaction,
                            }) as never,
                          )
                        }
                      >
                        <Text style={styles.regularWidthDetailButtonText}>Open details</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
      </View>

      <PremiumModalSheet
        visible={dateSheetOpen}
        onRequestClose={() => {
          setDraftPickerOpen(null)
          setDateSheetOpen(false)
        }}
      >
        <View style={styles.dateSheetContent}>
          <Text style={styles.dateSheetTitle}>Filter by date</Text>
          <Text style={styles.dateSheetSubtitle}>
            Pick a start and end date to scope transactions and totals.
          </Text>

          <View style={styles.dateRow}>
            <Pressable
              android_ripple={ripple.neutral}
              style={[
                styles.dateField,
                draftPickerOpen === 'from' ? styles.dateFieldActive : null,
              ]}
              onPress={() => setDraftPickerOpen(draftPickerOpen === 'from' ? null : 'from')}
              accessibilityRole="button"
              accessibilityLabel="Choose start date"
            >
              <Text style={styles.dateFieldLabel}>From</Text>
              <Text style={styles.dateFieldValue}>
                {draftFrom
                  ? `${draftFrom.toLocaleString('en-US', { month: 'short' })} ${draftFrom.getDate()}, ${draftFrom.getFullYear()}`
                  : 'Any'}
              </Text>
            </Pressable>
            <Pressable
              android_ripple={ripple.neutral}
              style={[
                styles.dateField,
                draftPickerOpen === 'to' ? styles.dateFieldActive : null,
              ]}
              onPress={() => setDraftPickerOpen(draftPickerOpen === 'to' ? null : 'to')}
              accessibilityRole="button"
              accessibilityLabel="Choose end date"
            >
              <Text style={styles.dateFieldLabel}>To</Text>
              <Text style={styles.dateFieldValue}>
                {draftTo
                  ? `${draftTo.toLocaleString('en-US', { month: 'short' })} ${draftTo.getDate()}, ${draftTo.getFullYear()}`
                  : 'Any'}
              </Text>
            </Pressable>
          </View>

          {draftPickerOpen ? (
            <View style={styles.dateInlinePicker}>
              <DateTimePicker
                value={
                  draftPickerOpen === 'from'
                    ? draftFrom || new Date()
                    : draftTo || draftFrom || new Date()
                }
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={
                  draftPickerOpen === 'from' && draftTo ? draftTo : new Date()
                }
                minimumDate={
                  draftPickerOpen === 'to' && draftFrom ? draftFrom : undefined
                }
                onChange={(event, picked) => {
                  if (Platform.OS !== 'ios') setDraftPickerOpen(null)
                  if (event.type === 'dismissed' || !picked) return
                  if (draftPickerOpen === 'from') {
                    setDraftFrom(picked)
                    if (draftTo && picked.getTime() > draftTo.getTime()) {
                      setDraftTo(picked)
                    }
                  } else {
                    setDraftTo(picked)
                    if (draftFrom && picked.getTime() < draftFrom.getTime()) {
                      setDraftFrom(picked)
                    }
                  }
                }}
              />
            </View>
          ) : null}

          <View style={styles.dateActionsRow}>
            <Pressable
              android_ripple={ripple.neutral}
              style={[styles.dateActionBtn, styles.dateActionBtnSecondary]}
              onPress={async () => {
                await haptics.select()
                setDraftFrom(null)
                setDraftTo(null)
                setDateRange({ from: null, to: null })
                setDraftPickerOpen(null)
                setDateSheetOpen(false)
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear date range"
            >
              <Text style={styles.dateActionBtnSecondaryText}>Clear</Text>
            </Pressable>
            <Pressable
              android_ripple={ripple.heroOnDark}
              style={[styles.dateActionBtn, styles.dateActionBtnPrimary]}
              onPress={async () => {
                haptics.tap()
                setDateRange({ from: draftFrom, to: draftTo })
                setDraftPickerOpen(null)
                setDateSheetOpen(false)
              }}
              accessibilityRole="button"
              accessibilityLabel="Apply date range"
            >
              <Text style={styles.dateActionBtnPrimaryText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </PremiumModalSheet>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.semantic.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  headerTitleWrap: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.semantic.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
    flexShrink: 0,
  },
  headerIconButtonActive: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  rangeChipRow: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[1],
    paddingBottom: spacing[2],
  },
  rangeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 122, 204, 0.10)',
  },
  rangeChipText: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 12,
  },
  dateSheetContent: {
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
    gap: spacing[3],
  },
  dateSheetTitle: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  dateSheetSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  dateField: {
    flex: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
    gap: 2,
  },
  dateFieldActive: {
    borderColor: colors.primary.main,
  },
  dateFieldLabel: {
    fontSize: 11,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    color: colors.text.secondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dateFieldValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  dateInlinePicker: {
    paddingHorizontal: 0,
  },
  dateActionsRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  dateActionBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateActionBtnSecondary: {
    backgroundColor: colors.semantic.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
  },
  dateActionBtnSecondaryText: {
    ...textStyles.bodyMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  dateActionBtnPrimary: {
    backgroundColor: colors.primary.main,
  },
  dateActionBtnPrimaryText: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    marginBottom: spacing[4],
  },
  summaryCard: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    color: colors.text.secondary,
    letterSpacing: 0.6,
    marginBottom: 4,
    textAlign: 'center',
    width: '100%',
  },
  summaryValue: {
    fontSize: 22,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.2,
    textAlign: 'center',
    width: '100%',
  },
  summaryValueIn: {
    color: colors.primary.main,
  },
  // Search
  searchContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[3],
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
    paddingHorizontal: spacing[4],
    ...Platform.select({
      ios: { paddingVertical: spacing[3] },
      android: { paddingVertical: spacing[2], minHeight: 44 },
    }),
    gap: spacing[2],
  },
  searchInput: {
    flex: 1,
    ...textStyles.textInputMedium,
    color: colors.text.primary,
    ...Platform.select({
      ios: { paddingVertical: 0 },
      android: {
        paddingVertical: 0,
        includeFontPadding: false,
      },
    }),
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    gap: spacing[2],
    paddingBottom: spacing[2],
  },

  // Transactions List
  transactionsContainer: {
    paddingHorizontal: spacing[5],
    paddingTop: 0,
    paddingBottom: spacing[6],
  },
  transactionsSplitContainer: {
    marginHorizontal: spacing[5],
    marginTop: spacing[1],
    alignSelf: 'center',
    width: '100%',
  },
  regularWidthRow: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  regularWidthListPane: {
    flex: 1.2,
  },
  regularWidthDetailPane: {
    flex: 0.8,
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
    padding: spacing[5],
    alignSelf: 'flex-start',
  },
  regularWidthDetailTitle: {
    ...textStyles.labelLarge,
    color: colors.text.secondary,
    marginBottom: spacing[2],
  },
  regularWidthDetailName: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  regularWidthDetailMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing[3],
  },
  regularWidthDetailAmount: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    marginBottom: spacing[4],
  },
  regularWidthDetailButton: {
    minHeight: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  regularWidthDetailButtonText: {
    ...textStyles.labelLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
  skeletonContainer: {
    paddingHorizontal: 0,
    paddingTop: spacing[2],
  },
  dateHeader: {
    fontSize: 11,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    color: colors.text.secondary,
    letterSpacing: 0.6,
    paddingHorizontal: spacing[2],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  dateHeaderFirst: {
    paddingTop: spacing[2],
  },
  /** White card chrome that wraps each row; corners adjust based on group position. */
  groupCard: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius['2xl'],
    overflow: 'hidden',
    marginBottom: spacing[1],
    ...shadows.xs,
  },
  groupRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
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
    borderBottomColor: colors.border.light,
  },
  transactionItemPressed: {
    backgroundColor: colors.semantic.muted,
    opacity: 0.85,
  },
  transactionItemLast: {
    marginBottom: 0,
  },
  /** Tinted-blue circular icon — primary @ ~10% alpha fill. */
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
  transactionAmountContainer: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: spacing[2],
  },
  transactionName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    marginBottom: 2,
  },
  transactionDate: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  transactionAmount: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  transactionAmountReceived: {
    color: colors.primary.main,
  },
  transactionStatusText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },

  // Empty State
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
    backgroundColor: colors.semantic.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  emptyStateTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[2],
  },
  emptyStateText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
  },
  loadMoreRow: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  loadMoreText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
})

export default function TransactionsScreen(props: NavigationProps) {
  return <TransactionsContent {...props} />
}
