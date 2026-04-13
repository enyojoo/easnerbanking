import React, { useState, useEffect, useRef } from 'react'
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
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ArrowDownLeft, ArrowUpRight, Monitor, Search } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { ShimmerLoader } from '../../components/premium'
import FrameContainer from '../../components/FrameContainer'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'
import { useUserData } from '../../contexts/UserDataContext'
import { NavigationProps, Transaction } from '../../types'
import { analytics } from '../../lib/analytics'
import { useAuth } from '../../contexts/AuthContext'
import { useFocusRefreshAll } from '../../hooks/useFocusRefresh'
import { apiGet, apiPost, NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import {
  buildUserCacheKey,
  readUserCache,
  writeUserCache,
  isCacheStale,
  CacheTTL,
} from '../../lib/userCache'
import { colors, shadows, textStyles, borderRadius, spacing, layout, motion, shouldPlayDecorativeMotionEnter } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { getTransactionStatusDisplay } from '../../utils/formatters'

// Get currencies from useUserData for formatAmount
function useCurrencies() {
  const { currencies } = useUserData()
  return currencies || []
}

interface CombinedTransaction {
  id: string
  transaction_id: string
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

// Helper function to get transaction name (defined outside component so it can be used in TransactionItem)
function getTransactionName(item: CombinedTransaction, transactionType: string): string {
  if (transactionType === 'receive') {
    // Check if it's a crypto deposit (stablecoin deposit via liquidation address)
    if (item.source_type === 'liquidation_address' || item.source_liquidation_address_id) {
      return 'Stablecoin Deposit'
    }
    
    // For fiat deposits (virtual account/ACH), show sender name only (not "Received from...")
    if (item.source_type === 'virtual_account') {
      // Check metadata for sender information
      const senderName = item.metadata?.source?.sender_name || 
                        item.metadata?.source?.originator_name ||
                        item.name
      if (senderName) {
        return senderName // Just the sender name for ACH deposits
      }
      return 'Bank Deposit'
    }
    
    // Fallback for other receive types
    return item.recipient_name ? `Received from ${item.recipient_name}` : 'Received'
  } else if (transactionType === 'send') {
    return item.recipient_name ? `Sent to ${item.recipient_name}` : 'Sent'
  } else {
    return 'Card Top-Up'
  }
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
  const insets = useSafeAreaInsets()
  const { userProfile } = useAuth()
  const currencies = useCurrencies()
  const { transactions: userTransactions, refreshStaleData, financialFeedsEpoch } = useUserData()
  
  const [transactions, setTransactions] = useState<CombinedTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
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

  const cacheKey = buildUserCacheKey('combinedTxList', userProfile?.id)

  // Fetch transactions with caching (stale-while-revalidate pattern)
  const fetchTransactions = React.useCallback(async (force = false, silent = false) => {
    if (!userProfile?.id) return

    let cached: { data: CombinedTransaction[]; timestamp: number } | null = null

    // Try to load from cache first (stale-while-revalidate)
    if (!force) {
      cached = await readUserCache<CombinedTransaction[]>(cacheKey)
      if (cached && !isCacheStale(cached.timestamp, CacheTTL.COMBINED_TX_LIST)) {
        // Data is fresh, use cache
        setTransactions(cached.data)
        setLoading(false)
        return
      } else if (cached) {
        // Data is stale, show cached data immediately, then fetch fresh
        setTransactions(cached.data)
        setLoading(false)
        // Continue to fetch fresh data in background
      }
    }

    try {
      // Only show loading if not silent and we don't have cached data
      if (!silent && (!cached || force)) {
        setLoading(true)
      }

      const params = new URLSearchParams()
      params.append('limit', '100')

      // Try bridge transactions API first, fallback to combined transactions
      let response = await apiGet(`/api/noah/transactions?${params.toString()}`)
      if (!response.ok || (response as any).isNetworkError) {
        response = await apiGet(`/api/transactions?${params.toString()}`, {
          headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
        })
      }
      
      if (response.ok && !(response as any).isNetworkError) {
        const data = await response.json()
        const transactionsList = data.transactions || []
        
        setTransactions(transactionsList)
        await writeUserCache(cacheKey, transactionsList)
        setError(null)
      } else if ((response as any).isNetworkError) {
        // Network error - keep cached data if available
        console.warn("Network error fetching transactions, keeping cached data")
        if (!cached) {
          setError("Network error. Please check your connection.")
          setTransactions([])
        }
      } else {
        if (!cached) {
          setTransactions([])
          setError("Failed to load transactions")
        }
      }
    } catch (error: any) {
      if (error?.message?.includes('Network request failed') || error?.name === 'TypeError') {
        console.warn("Network error fetching transactions:", error?.message || 'Network unavailable')
        if (!cached) {
          setError("Network error. Please check your connection.")
          setTransactions([])
        }
      } else {
        console.error("Error fetching transactions:", error)
        if (!cached) {
          setError("Failed to load transactions")
          setTransactions([])
        }
      }
    } finally {
      setLoading(false)
    }
  }, [userProfile?.id, cacheKey])

  // Initial load
  useEffect(() => {
    if (!userProfile?.id) return
    fetchTransactions(false)
  }, [userProfile?.id, fetchTransactions])

  // Refetch combined list when a transaction row changes in Supabase (receives, card funding sync, etc.).
  useEffect(() => {
    if (!userProfile?.id || financialFeedsEpoch === 0) return
    fetchTransactions(false, true).catch(() => {})
  }, [financialFeedsEpoch, userProfile?.id, fetchTransactions])

  // Refresh stale data when screen comes into focus
  useFocusRefreshAll(false) // Only refresh if stale (> 5 minutes)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      void apiPost('/api/noah/sync-transactions').catch((error) => {
        console.warn('[TRANSACTIONS] Sync failed on pull-to-refresh:', error)
      })
      // Spinner follows this screen’s list fetch only — `refreshStaleData({ force })` can be slow and must not block RefreshControl.
      await fetchTransactions(true)
    } catch (error: any) {
      if (error?.message?.includes('Network request failed') || error?.name === 'TypeError') {
        console.warn("Network error refreshing transactions:", error?.message || 'Network unavailable')
      } else {
        console.error("Error refreshing transactions:", error)
      }
    } finally {
      setRefreshing(false)
    }
    void refreshStaleData({ force: true }).catch((e) => {
      console.warn('[TRANSACTIONS] Background user-data refresh after pull:', e)
    })
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

  const filteredTransactions = (transactions || []).filter(transaction => {
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
          { paddingBottom: insets.bottom + layout.tabBarHeight + spacing[6] },
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
        <View style={styles.transactionsContainer}>
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
            <>
              {filteredTransactions.map((item, index) => {
                const isLast = index === filteredTransactions.length - 1
                const detailScreen = 'TransactionDetails'
                
                return (
                  <TransactionItem
                    key={item.id || item.transaction_id || `tx-${item.created_at}`}
                    item={item}
                    index={index}
                    isLast={isLast}
                    skipRowEntranceAnim={skipRowEntranceAnim}
                    onPress={() => {
                      navigation.navigate(detailScreen as never, { 
                        transactionId: item.transaction_id,
                        fromScreen: 'Transactions'
                      } as never)
                    }}
                    formatAmount={formatAmount}
                    formatDate={formatDate}
                  />
                )
              })}
            </>
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
    fontFamily: 'Outfit-Medium',
    marginBottom: spacing[1],
  },
  transactionDate: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
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
