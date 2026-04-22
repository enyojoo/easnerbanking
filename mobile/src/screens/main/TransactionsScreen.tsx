import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
  TextInput,
  Animated,
  ScrollView,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { ArrowDownLeft, ArrowUpRight, Monitor, Search } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import ScreenWrapper from '../../components/ScreenWrapper'
import { ShimmerLoader } from '../../components/premium'
import FrameContainer from '../../components/FrameContainer'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'
import { useCurrenciesCatalog, useTransactionsList } from '../../hooks/queries'
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
  shadows,
  textStyles,
  borderRadius,
  spacing,
  motion,
  shouldPlayDecorativeMotionEnter,
  isRegularWidth,
  getContentWidth,
  scaledFontSize,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { getTransactionStatusDisplay } from '../../utils/formatters'
import { isEasnerProductReceiveTitle, isEasnerProductSendTitle, markRecentMoneyActivity, qk } from '@easner/shared'
import { useFocusEffect } from '@react-navigation/native'
import { apiPost } from '../../lib/apiClient'
import { useAuth } from '../../contexts/AuthContext'

const TRANSACTIONS_CACHE_KEY_PREFIX = 'easner_transactions_screen_list_'
const TRANSACTIONS_CACHE_TTL_MS = 60 * 60 * 1000

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

// Helper function to get transaction name (defined outside component so it can be used in TransactionItem)
function getTransactionName(item: CombinedTransaction, transactionType: string): string {
  if (transactionType === 'card_funding') {
    return 'Card Top-Up'
  }

  if (transactionType === 'receive') {
    if (item.source_type === 'liquidation_address' || item.source_liquidation_address_id) {
      return 'Stablecoin Deposit'
    }

    const display = String(item.name || '').trim()
    if (display === 'Stablecoin Deposit') {
      return display
    }

    if (item.source_type === 'virtual_account') {
      const senderName =
        item.metadata?.source?.sender_name ||
        item.metadata?.source?.originator_name ||
        item.name
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

    const fromRecipient = item.recipient?.full_name
    return fromRecipient ? `Received from ${fromRecipient}` : 'Received'
  }

  if (transactionType === 'send') {
    if (isEasnerProductSendTitle(item.name)) {
      return String(item.name).trim()
    }
    const toName = item.recipient?.full_name
    return toName ? `Sent to ${toName}` : 'Sent'
  }

  return 'Card Top-Up'
}

// Animated Transaction Item Component
function TransactionItem({ 
  item, 
  index, 
  isLast,
  onPress,
  formatAmount,
  formatDate,
  skipRowEntranceAnim,
}: { 
  item: CombinedTransaction
  index: number
  isLast: boolean
  onPress: () => void
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

  // Noah-backed rows use `transaction_type`; older `transactions` rows use `type`. Detail uses
  // TransactionDetails when Noah id is present, else LegacyTransactionDetails for legacy sends.
  const transactionType = item.transaction_type || item.type || 'send'
  const statusDisplay = getTransactionStatusDisplay(item.status)
  const statusColor = statusDisplay?.color || colors.neutral[500]

  const getTransactionIcon = () => {
    const iconColor = colors.primary.main
    
    switch (transactionType) {
      case 'send':
        return (
          <View style={styles.transactionIconBox}>
            <ArrowUpRight size={16} color={iconColor} strokeWidth={2.5} />
          </View>
        )
      case 'receive':
        return (
          <View style={styles.transactionIconBox}>
            <ArrowDownLeft size={16} color={iconColor} strokeWidth={2.5} />
          </View>
        )
      case 'card_funding':
        return (
          <View style={styles.transactionIconBox}>
            <Monitor size={16} color={iconColor} strokeWidth={2.5} />
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
        style={[styles.transactionItem, isLast && styles.transactionItemLast]}
        onPress={async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onPress()
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut} >
        {getTransactionIcon()}
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionName}>
            {getTransactionName(item, transactionType)}
          </Text>
          <Text style={styles.transactionDate}>
            {formatDate(item.noah_created_at || item.created_at)}
          </Text>
        </View>
        <View style={styles.transactionAmountContainer}>
          <Text
            style={[
              styles.transactionAmount,
              transactionType === 'receive' && styles.transactionAmountReceived
            ]}
          >
            {formatAmount(
              item.amount || item.send_amount || item.crypto_amount || item.fiat_amount || 0,
              item.currency || item.send_currency || item.crypto_currency || item.fiat_currency || 'USD',
              transactionType === 'receive'
            )}
          </Text>
          {statusDisplay ? (
            <Text
              style={[
                styles.transactionStatus,
                { color: statusColor }
              ]}
            >
              {statusDisplay.label}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

// Loading Skeleton - Frame Only
function TransactionsSkeleton() {
  return (
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
  )
}

function TransactionsContent({ navigation }: NavigationProps) {
  const { width: windowWidth } = useWindowDimensions()
  const regularWidth = isRegularWidth(windowWidth)
  const contentWidth = getContentWidth(windowWidth, spacing[5])
  const splitConfig = useMemo(() => {
    if (windowWidth >= 1024) {
      return {
        maxWidth: Math.min(windowWidth - spacing[10], 980),
        listFlex: 1.1,
        detailFlex: 0.9,
        gap: spacing[4],
        detailPadding: spacing[5],
        titleSize: scaledFontSize(12, windowWidth),
        nameSize: scaledFontSize(22, windowWidth),
        metaSize: scaledFontSize(13, windowWidth),
        amountSize: scaledFontSize(28, windowWidth),
      }
    }
    if (windowWidth >= 768) {
      return {
        maxWidth: Math.min(windowWidth - spacing[8], 920),
        listFlex: 1.16,
        detailFlex: 0.84,
        gap: spacing[4],
        detailPadding: spacing[5],
        titleSize: scaledFontSize(12, windowWidth),
        nameSize: scaledFontSize(20, windowWidth),
        metaSize: scaledFontSize(12, windowWidth),
        amountSize: scaledFontSize(26, windowWidth),
      }
    }
    return {
      maxWidth: Math.min(windowWidth - spacing[6], 860),
      listFlex: 1.28,
      detailFlex: 0.72,
      gap: spacing[3],
      detailPadding: spacing[4],
      titleSize: scaledFontSize(11, windowWidth),
      nameSize: scaledFontSize(18, windowWidth),
      metaSize: scaledFontSize(12, windowWidth),
      amountSize: scaledFontSize(24, windowWidth),
    }
  }, [windowWidth])
  const { refreshBalances } = useBalance()
  const { user, userProfile } = useAuth()
  const { scope } = useScope()
  const qc = useQueryClient()
  const currencies = useCurrencies()
  const txQuery = useTransactionsList({}, 100)
  
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
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
    const recentRows = queryRows.slice(0, 30)
    for (const row of recentRows) {
      const txId = transactionDetailLookupId(row)
      if (!txId) continue
      void qc.prefetchQuery({
        queryKey: qk.transactions.detail(scope, txId),
        queryFn: () =>
          apiFetch<{ transaction?: CombinedTransaction }>(
            `/api/transactions/${encodeURIComponent(txId)}`,
            { headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS } },
          ),
        staleTime: 45_000,
      })
    }
  }, [qc, queryRows, scope])

  // Refresh stale data when screen comes into focus
  useFocusRefreshAll(false) // Only refresh if stale (> 5 minutes)

  const syncChainLedgerIfDue = React.useCallback(
    async (force: boolean = false): Promise<boolean> => {
      const now = Date.now()
      const MIN_MS = 10 * 60_000
      if (!force && now - lastChainLedgerSyncRef.current < MIN_MS) return false
      if (chainLedgerSyncInFlightRef.current) {
        return chainLedgerSyncInFlightRef.current
      }

      const run = (async () => {
        try {
          const response = await apiPost('/api/wallets/sync-chain-ledger', undefined, {
            headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
          })
          if (!response.ok) return false
          lastChainLedgerSyncRef.current = Date.now()
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

  useFocusEffect(
    React.useCallback(() => {
      void (async () => {
        const insertedRows = await syncChainLedgerIfDue(false)
        if (insertedRows) {
          await txQuery.refetch()
        }
      })()
    }, [syncChainLedgerIfDue, txQuery]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      await syncChainLedgerIfDue(true)
      await Promise.all([refreshBalances(true), txQuery.refetch()])
    } catch (error: any) {
      if (error?.message?.includes('Network request failed') || error?.name === 'TypeError') {
        console.warn("Network error refreshing transactions:", error?.message || 'Network unavailable')
      } else {
        console.error("Error refreshing transactions:", error)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const formatAmount = (amount: number, currency: string, isReceived: boolean = false) => {
    const sign = isReceived ? '+' : '-'
    // Normalize currency to uppercase for lookup
    const normalizedCurrency = (currency || 'USD').toUpperCase()
    const currencyData = currencies.find((c) => c && c.code === normalizedCurrency)
    // Fallback to common symbols if currency data not found
    const symbol = currencyData?.symbol || 
                   (normalizedCurrency === 'USD' ? '$' : 
                    normalizedCurrency === 'EUR' ? '€' : 
                    normalizedCurrency)
    
    // Check if amount has decimal places
    const hasDecimals = amount % 1 !== 0
    const formattedAmount = hasDecimals
      ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    
    return `${sign}${symbol}${formattedAmount}`
  }

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

  const filteredTransactions = transactions.filter(transaction => {
    if (!transaction) return false
    if (!searchTerm.trim()) return true
    
    const searchLower = searchTerm.toLowerCase()
    const txType = transaction.transaction_type || transaction.type
    const matchesSearch =
      (transaction.transaction_id || transaction.id)?.toLowerCase().includes(searchLower) ||
      transaction.name?.toLowerCase().includes(searchLower) ||
      (txType === 'send' &&
        transaction.recipient?.full_name?.toLowerCase().includes(searchLower)) ||
      (txType === 'receive' &&
        (transaction.receipt_destination_tx_hash?.toLowerCase().includes(searchLower) ||
         transaction.crypto_wallet?.wallet_address?.toLowerCase().includes(searchLower)))
    return matchesSearch
  })

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
            <View>
              <Text style={styles.title}>Transactions</Text>
            </View>
          </View>
        </Animated.View>

      {/* Search bar — match RecipientsScreen */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Search size={18} color={colors.primary.main} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search by name or ID..."
            placeholderTextColor={colors.text.secondary}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {searchTerm.length > 0 ? (
            <Pressable android_ripple={ripple.neutral} onPress={() => setSearchTerm('')}>
              <Ionicons name="close-circle" size={18} color={colors.primary.main} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Transactions List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: spacing[8] },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary.main}
          />
        }
      >
        <View
          style={
            regularWidth
              ? [styles.transactionsSplitContainer, { maxWidth: splitConfig.maxWidth }]
              : [styles.transactionsContainer, { maxWidth: contentWidth, alignSelf: 'center', width: '100%' }]
          }
        >
          {loading ? (
            <TransactionsSkeleton />
          ) : filteredTransactions.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="receipt-outline" size={40} color={colors.neutral[400]} />
              </View>
              <Text style={styles.emptyStateTitle}>
                {searchTerm ? 'No transactions found' : 'No transactions yet'}
              </Text>
              <Text style={styles.emptyStateText}>
                {searchTerm 
                  ? 'Try adjusting your search terms or clear the search to see all transactions' 
                  : 'Your recent transactions will appear here once you send, receive or spend money'}
              </Text>
            </View>
          ) : (
            <View style={regularWidth ? [styles.regularWidthRow, { gap: splitConfig.gap }] : undefined}>
              <View
                style={
                  regularWidth ? [styles.regularWidthListPane, { flex: splitConfig.listFlex }] : undefined
                }
              >
                {filteredTransactions.map((item, index) => {
                  const isLast = index === filteredTransactions.length - 1
                  const detailScreen = 'TransactionDetails'

                  return (
                    <TransactionItem
                      key={item.ledger_row_id || item.id || item.transaction_id || `tx-${item.created_at}`}
                      item={item}
                      index={index}
                      isLast={isLast}
                      skipRowEntranceAnim={skipRowEntranceAnim}
                      onPress={() => {
                        const lookupId = transactionDetailLookupId(item)
                        if (regularWidth) {
                          setSelectedTransactionId(lookupId)
                          return
                        }
                        navigation.navigate(detailScreen as never, {
                          transactionId: lookupId,
                          fromScreen: 'Transactions',
                          initialTransaction: item,
                        } as never)
                      }}
                      formatAmount={formatAmount}
                      formatDate={formatDate}
                    />
                  )
                })}
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
                          navigation.navigate('TransactionDetails' as never, {
                            transactionId: transactionDetailLookupId(selectedTransaction),
                            fromScreen: 'Transactions',
                            initialTransaction: selectedTransaction,
                          } as never)
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
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
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
    paddingBottom: spacing[2],
  },
  headerContent: {
    alignItems: 'flex-start',
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
  },
  // Search — aligned with RecipientsScreen
  searchContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[4],
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    ...Platform.select({
      ios: { paddingVertical: spacing[3] },
      android: { paddingVertical: spacing[2], minHeight: 44 },
    }),
    gap: spacing[2],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
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
  
  // Transactions List
  transactionsContainer: {
    marginHorizontal: spacing[5],
    marginTop: spacing[3],
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius['3xl'],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[8],
  },
  transactionsSplitContainer: {
    marginHorizontal: spacing[5],
    marginTop: spacing[3],
    alignSelf: 'center',
    width: '100%',
  },
  regularWidthRow: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  regularWidthListPane: {
    flex: 1.2,
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius['3xl'],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[8],
  },
  regularWidthDetailPane: {
    flex: 0.8,
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius['3xl'],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
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
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  regularWidthDetailButtonText: {
    ...textStyles.labelLarge,
    color: colors.text.inverse,
    fontFamily: 'Geist-SemiBold',
  },
  skeletonContainer: {
    paddingHorizontal: 0,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
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
  transactionAmountContainer: {
    alignItems: 'flex-end',
    gap: spacing[0.5],
  },
  transactionName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Geist-Medium',
    marginBottom: spacing[1],
  },
  transactionDate: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Geist-Regular',
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
})

export default function TransactionsScreen(props: NavigationProps) {
  return <TransactionsContent {...props} />
}
