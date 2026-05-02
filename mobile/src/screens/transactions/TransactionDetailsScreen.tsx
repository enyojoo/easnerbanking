import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
  Animated,
} from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Copy,
  HelpCircle,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useQueryClient } from '@tanstack/react-query'
import ScreenWrapper from '../../components/ScreenWrapper'
import { TransactionDetailsBodySkeleton } from '../../components/skeletons'
import { SectionCard, StatusPill } from '../../components/ui'
import { NavigationProps } from '../../types'
import {
  colors,
  textStyles,
  borderRadius,
  spacing,
  motion,
  fontFamily,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { ripple } from '../../lib/androidRipple'
import { useTransactionDetail, useCurrenciesCatalog } from '../../hooks/queries'
import { isEasnerProductReceiveTitle, isEasnerProductSendTitle, qk } from '@easner/shared'
import { ApiError } from '../../query/api-client'
import { useScope } from '../../query/scope'

interface LedgerTransaction {
  id: string
  transaction_id: string
  noah_transaction_id?: string
  transaction_type: 'send' | 'receive'
  direction: 'credit' | 'debit'
  amount: number
  currency: string
  final_amount?: number
  status: string
  source_type?: string
  source_payment_rail?: string
  destination_payment_rail?: string
  recipient_name?: string
  /** Counterparty display name when the API includes it. */
  name?: string
  receipt_trace_number?: string
  receipt_imad?: string
  receipt_destination_tx_hash?: string
  tx_hash?: string
  receipt_final_amount?: number
  reference?: string
  metadata?: any
  created_at: string
  updated_at: string
  completed_at?: string
  noah_created_at?: string
  /** Product line for summary ("Bank Deposit", "Stablecoin Deposit", …) — separate from sender name. */
  transaction_product?: string
  /** Inbound bank: remitter / company / merchant (detail API). */
  sender_display_name?: string
}

type StatusInfo = {
  color: string
  Icon: LucideIcon
  label: string
  gradient: readonly [string, string]
}

function statusInfoToneFromInfo(info: StatusInfo) {
  const label = info.label.toLowerCase()
  if (label.includes('completed')) return 'completed' as const
  if (label.includes('processing') || label.includes('pending')) return 'pending' as const
  if (label.includes('failed') || label.includes('refunded') || label.includes('returned'))
    return 'failed' as const
  if (label.includes('cancel')) return 'cancelled' as const
  if (label.includes('review')) return 'pending' as const
  return 'neutral' as const
}

function mergeTransactionSnapshots(
  primary: LedgerTransaction | null | undefined,
  fallback: LedgerTransaction | null | undefined,
): LedgerTransaction | null {
  if (!primary && !fallback) return null
  if (!primary) return fallback ?? null
  if (!fallback) return primary

  const merged = { ...fallback } as Record<string, unknown>
  const source = primary as Record<string, unknown>
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')) {
      merged[key] = value
    }
  }
  return merged as LedgerTransaction
}

export default function TransactionDetailsScreen({ navigation, route }: NavigationProps) {
  const { transactionId, fromScreen, initialTransaction } = route.params as {
    transactionId: string
    fromScreen?: string
    initialTransaction?: LedgerTransaction | null
  }
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const { scope } = useScope()
  const detailQuery = useTransactionDetail(transactionId)
  const { data: currencies = [] } = useCurrenciesCatalog()
  const copyToClipboard = useCopyToClipboard()
  const cachedListSnapshot = useMemo<LedgerTransaction | null>(() => {
    if (!scope || !transactionId) return null
    const listState = qc.getQueryState(qk.transactions.list(scope, {}))
    const listData = qc.getQueryData(qk.transactions.list(scope, {})) as
      | { pages?: Array<{ transactions?: Array<Record<string, unknown>> }> }
      | undefined
    if (!listState || !listData?.pages?.length) return null
    for (const page of listData.pages) {
      for (const row of page.transactions ?? []) {
        const id = String(row?.id ?? '')
        const txid = String(row?.transaction_id ?? '')
        const ledgerId = String(row?.ledger_row_id ?? '')
        if (transactionId === id || transactionId === txid || transactionId === ledgerId) {
          return row as unknown as LedgerTransaction
        }
      }
    }
    return null
  }, [qc, scope, transactionId])
  const cachedDetailSnapshot = useMemo<LedgerTransaction | null>(() => {
    if (!scope || !transactionId) return null
    const detailData = qc.getQueryData(qk.transactions.detail(scope, transactionId)) as
      | { transaction?: LedgerTransaction }
      | LedgerTransaction
      | undefined
    if (!detailData) return null
    return ((detailData as { transaction?: LedgerTransaction })?.transaction ??
      detailData) as LedgerTransaction
  }, [qc, scope, transactionId])

  const [transaction, setTransaction] = useState<LedgerTransaction | null>(
    mergeTransactionSnapshots(
      initialTransaction ?? null,
      mergeTransactionSnapshots(cachedDetailSnapshot, cachedListSnapshot),
    ),
  )
  const [loading, setLoading] = useState(initialTransaction || cachedDetailSnapshot || cachedListSnapshot ? false : true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({})
  const dataLoadedRef = useRef(false)

  const hasCoreDetailFields = useMemo(() => {
    if (!transaction) return false
    // "Atomic render" gate: require the minimum set of fields that the UI depends on
    // (status header card + timestamp formatting + direction label).
    const hasAmount = typeof transaction.amount === 'number' && Number.isFinite(transaction.amount)
    const hasCurrency = typeof transaction.currency === 'string' && transaction.currency.trim().length > 0
    const hasStatus = typeof transaction.status === 'string' && transaction.status.trim().length > 0
    const hasType =
      transaction.transaction_type === 'send' || transaction.transaction_type === 'receive'
    const hasCreated =
      typeof transaction.created_at === 'string' && transaction.created_at.trim().length > 0
    const hasTransactionId =
      typeof transaction.transaction_id === 'string' && transaction.transaction_id.trim().length > 0
    return hasAmount && hasCurrency && hasStatus && hasType && hasCreated && hasTransactionId
  }, [transaction])

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  useEffect(() => {
    dataLoadedRef.current = false
    setTransaction(
      mergeTransactionSnapshots(
        initialTransaction ?? null,
        mergeTransactionSnapshots(cachedDetailSnapshot, cachedListSnapshot),
      ),
    )
    setError(null)
    setLoading(initialTransaction || cachedDetailSnapshot || cachedListSnapshot ? false : true)
  }, [transactionId, initialTransaction, cachedDetailSnapshot, cachedListSnapshot])

  useEffect(() => {
    if (!transactionId) return

    if (detailQuery.isPending) {
      // Keep initial row data visible; only show skeleton when we truly have nothing.
      setLoading(!transaction)
      return
    }

    if (detailQuery.isError) {
      const err = detailQuery.error
      const msg =
        err instanceof ApiError
          ? err.status === 404
            ? 'Transaction not found'
            : err.message
          : 'Failed to load transaction details'
      setError(msg)
      // Keep prior/initial snapshot visible instead of hard blanking.
      if (!transaction) {
        setTransaction(null)
      }
      setLoading(false)
      return
    }

    const raw = detailQuery.data
    if (!raw) {
      setError('Transaction not found')
      setTransaction(null)
      setLoading(false)
      return
    }
    const transactionData = ((raw as any)?.transaction ?? raw) as LedgerTransaction | null | undefined
    if (transactionData) {
      setTransaction((prev) => mergeTransactionSnapshots(transactionData, prev))
      dataLoadedRef.current = true
      setError(null)
    } else {
      setError('Transaction not found')
      setTransaction(null)
    }
    setLoading(false)
  }, [
    transactionId,
    detailQuery.data,
    detailQuery.isPending,
    detailQuery.isError,
    detailQuery.error,
  ])

  const fetchTransactionDetails = useCallback(async (force = false) => {
    if (dataLoadedRef.current && !force) return
    setLoading(true)
    setError(null)
    try {
      const result = await detailQuery.refetch()
      const transactionData = ((result.data as any)?.transaction ?? result.data) as LedgerTransaction | null | undefined
      if (transactionData) {
        setTransaction((prev) => mergeTransactionSnapshots(transactionData, prev))
        dataLoadedRef.current = true
      } else {
        setError('Transaction not found')
      }
    } catch (err: any) {
      console.error('Error fetching transaction details:', err)
      setError('Failed to load transaction details')
    } finally {
      setLoading(false)
    }
  }, [detailQuery])

  const onRefresh = async () => {
    setRefreshing(true)
    dataLoadedRef.current = false
    try {
      await fetchTransactionDetails(true)
    } finally {
      setRefreshing(false)
    }
  }

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text)
    if (!ok) return
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setCopiedStates((prev) => ({ ...prev, [key]: true }))
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [key]: false }))
    }, 2000)
  }

  const formatAmount = (amount: number, currency: string, isReceived: boolean) => {
    const sign = isReceived ? '' : '-'
    // Normalize currency to uppercase
    const normalizedCurrency = (currency || 'USD').toUpperCase()
    const currencyData = currencies.find((c) => c && c.code === normalizedCurrency)
    const symbol = currencyData?.symbol || 
                   (normalizedCurrency === 'USD' ? '$' : 
                    normalizedCurrency === 'EUR' ? '€' : 
                    normalizedCurrency)
    
    // Check if amount has decimal places
    const absAmount = Math.abs(amount)
    const hasDecimals = absAmount % 1 !== 0
    const formattedAmount = hasDecimals
      ? absAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : absAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    
    return `${sign}${symbol}${formattedAmount}`
  }

  const formatTimestamp = (dateString: string) => {
    if (!dateString) return ''
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

  const formatScheme = (transaction: LedgerTransaction, paymentRail: string) => {
    const railLower = (paymentRail || '').toLowerCase().replace(/_/g, ' ')
    
    // For crypto deposits (liquidation address), show "USDC on SOL" or "EURC on SOL" format
    if (transaction.source_type === 'liquidation_address') {
      const railMap: Record<string, string> = {
        solana: 'SOL',
        ethereum: 'ETH',
        polygon: 'MATIC',
        polygonpos: 'MATIC',
      }
      const railDisplay = railMap[railLower] || railLower.toUpperCase()
      // Map USD->USDC, EUR->EURC from metadata or transaction currency
      const sourceCurrency = transaction.metadata?.source_currency?.toUpperCase() || 
        transaction.currency?.toUpperCase() || ''
      const stablecoin = sourceCurrency === 'EUR' || sourceCurrency === 'EURC' ? 'EURC' : 'USDC'
      return `${stablecoin} on ${railDisplay}`
    }
    
    // For fiat deposits (virtual account), determine ACH PUSH, ACH PULL, WIRE, SEPA, or SEPA INSTANT
    if (railLower === 'ach' || railLower.includes('ach')) {
      // Check metadata for ACH type (push/pull)
      // Noah / ledger payloads often expose this in metadata.source or activity.source
      // Normalize any underscores or variations
      const achType = (transaction.metadata?.source?.ach_type || 
                      transaction.metadata?.ach_type ||
                      transaction.metadata?.source?.type ||
                      '').toLowerCase().replace(/_/g, ' ').trim()
      
      if (achType === 'push' || achType === 'ach push' || achType.includes('push')) {
        return 'ACH PUSH'
      } else if (achType === 'pull' || achType === 'ach pull' || achType.includes('pull')) {
        return 'ACH PULL'
      }
      // Default to ACH PUSH if not specified (most common)
      return 'ACH PUSH'
    }
    
    if (railLower === 'wire' || railLower.includes('wire')) {
      return 'WIRE'
    }
    
    if (railLower === 'sepa' || railLower.includes('sepa')) {
      // Check if it's SEPA INSTANT or regular SEPA
      const sepaType = (transaction.metadata?.source?.sepa_type ||
                        transaction.metadata?.sepa_type ||
                        transaction.metadata?.source?.type ||
                        paymentRail || '').toLowerCase().replace(/_/g, ' ').trim()
      
      if (sepaType.includes('instant') || sepaType.includes('sepa instant')) {
        return 'SEPA INSTANT'
      }
      // Default to regular SEPA
      return 'SEPA'
    }
    
    // Fallback for other payment rails - remove underscores and format nicely
    return railLower.replace(/_/g, ' ').split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }
  
  const getTransactionTypeDisplay = (): string => {
    if (transaction.transaction_type === 'receive') {
      if (transaction.source_type === 'liquidation_address') {
        return 'Stablecoin Deposit'
      }
      const n = String(transaction.name || '').trim()
      if (n) return n
      return 'Bank Deposit'
    }
    if (transaction.transaction_type === 'send' && isEasnerProductSendTitle(transaction.name)) {
      return String(transaction.name).trim()
    }
    return getTransactionName()
  }

  /** First summary row: fixed category from API when present, else legacy heuristic. */
  const getMetadataString = (key: string): string | undefined => {
    const value = transaction?.metadata?.[key]
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed || undefined
  }

  const getStatusInfo = (status: string): {
    color: string
    Icon: LucideIcon
    label: string
    gradient: readonly [string, string]
  } => {
    const statusLower = status.toLowerCase()
    if (statusLower.includes('processed') || statusLower.includes('completed')) {
      return {
        color: colors.success.main,
        Icon: CircleCheck,
        label: 'Completed',
        gradient: colors.success.gradient,
      }
    }
    if (
      statusLower.includes('pending') ||
      statusLower.includes('awaiting') ||
      statusLower.includes('scheduled') ||
      statusLower.includes('received')
    ) {
      return {
        color: colors.warning.main,
        Icon: Clock,
        label: 'Processing',
        gradient: colors.primary.gradient,
      }
    }
    if (statusLower.includes('failed') || statusLower.includes('returned') || statusLower.includes('refunded')) {
      return {
        color: colors.error.main,
        Icon: CircleX,
        label: statusLower.includes('refunded') ? 'Refunded' : 'Failed',
        gradient: colors.error.gradient || colors.primary.gradient,
      }
    }
    if (statusLower.includes('review')) {
      return {
        color: colors.warning.main,
        Icon: CircleAlert,
        label: 'In Review',
        gradient: colors.primary.gradient,
      }
    }
    return {
      color: colors.text.secondary,
      Icon: CircleHelp,
      label: status.replace(/_/g, ' '),
      gradient: colors.primary.gradient,
    }
  }

  const getTransactionName = (): string => {
    if (!transaction) return ''

    if (transaction.transaction_type === 'receive') {
      if (transaction.source_type === 'liquidation_address') {
        return 'Stablecoin Deposit'
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

      const n = String(transaction.name || '').trim()
      if (n && !isEasnerProductReceiveTitle(n)) {
        return n
      }
      if (isEasnerProductReceiveTitle(n)) {
        return n
      }

      return transaction.name ? `Received from ${transaction.name}` : 'Received'
    } else {
      if (isEasnerProductSendTitle(transaction.name)) {
        return String(transaction.name).trim()
      }
      const counterparty = transaction.recipient_name
      return counterparty
        ? `Sent to ${counterparty}`
        : transaction.name
          ? `Sent to ${transaction.name}`
          : 'Sent'
    }
  }

  const renderCopyableField = (label: string, value: string | undefined, fieldName: string) => {
    if (!value) return null

    const isCopied = copiedStates[fieldName]

    return (
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Pressable
         android_ripple={ripple.neutral}
          style={styles.copyableValueRow}
          onPress={() => handleCopy(value, fieldName)} >
          <Text style={styles.summaryValue} numberOfLines={1}>
            {value}
          </Text>
          <View style={[styles.copyIcon, isCopied && styles.copyIconSuccess]}>
            {isCopied ? (
              <Check size={14} color={colors.success.main} strokeWidth={2.5} />
            ) : (
              <Copy size={14} color={colors.primary.main} strokeWidth={2} />
            )}
          </View>
        </Pressable>
      </View>
    )
  }

  const handleSendAgain = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                navigation.navigate('SelectRecentRecipient' as never)
  }

  // Skeleton loading component
  const TransactionDetailsSkeleton = () => (
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
        <Pressable
         android_ripple={ripple.neutral}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            navigation.goBack()
          }}
          style={styles.backButton} >
          <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerContent}>
        </View>
      </Animated.View>
      
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing[5] }]}
        showsVerticalScrollIndicator={false}
      >
        <TransactionDetailsBodySkeleton />
      </ScrollView>
    </View>
  )

  // Prevent a partially-populated cached snapshot from rendering a mostly-empty UI.
  // If we don't have core fields yet, treat the view as loading until the detail query resolves.
  const shouldShowSkeleton =
    (loading && (!transaction || !hasCoreDetailFields)) ||
    (detailQuery.isPending && !hasCoreDetailFields && !error)

  if (shouldShowSkeleton) {
    return (
      <ScreenWrapper>
        <TransactionDetailsSkeleton />
      </ScreenWrapper>
    )
  }

  if (error || !transaction) {
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
            <Pressable
             android_ripple={ripple.neutral}
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.goBack()
              }}
              style={styles.backButton} >
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
        <View style={styles.headerContent}>
        </View>
          </Animated.View>
          
          <View style={styles.errorContainer}>
            <View style={styles.errorIconContainer}>
              <AlertCircle size={48} color={colors.error.main} strokeWidth={2} />
            </View>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorText}>{error || 'Transaction not found'}</Text>
            <Pressable android_ripple={ripple.neutral} style={styles.retryButton} onPress={() => fetchTransactionDetails(true)}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      </ScreenWrapper>
    )
  }

  const isReceived = transaction.transaction_type === 'receive'
  const statusInfo = getStatusInfo(transaction.status)
  const isFailed = transaction.status.toLowerCase().includes('failed') || 
                   transaction.status.toLowerCase().includes('returned') ||
                   transaction.status.toLowerCase().includes('refunded')
  const isEasetagP2p = transaction.source_type === 'easetag_p2p'

  const easetagWhenTs =
    transaction.completed_at ||
    transaction.updated_at ||
    transaction.noah_created_at ||
    transaction.created_at

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
          <Pressable
           android_ripple={ripple.neutral}
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              navigation.goBack()
            }}
            style={styles.backButton} >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Transaction</Text>
          </View>
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />
          }
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing[5] }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — white SectionCard with 64px tinted icon, title, amount, status pill. */}
          <Animated.View
            style={[
              styles.heroAnimated,
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
            <SectionCard style={styles.heroCard}>
              <View style={styles.heroIcon}>
                {isReceived ? (
                  <ArrowDownLeft size={28} color={colors.primary.main} strokeWidth={2.25} />
                ) : (
                  <ArrowUpRight size={28} color={colors.primary.main} strokeWidth={2.25} />
                )}
              </View>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {getTransactionTypeDisplay()}
              </Text>
              <Text
                style={[
                  styles.heroAmount,
                  isReceived ? styles.heroAmountIn : styles.heroAmountOut,
                ]}
                numberOfLines={1}
              >
                {formatAmount(transaction.amount, transaction.currency, isReceived)}
              </Text>
              <StatusPill
                label={statusInfo.label}
                tone={statusInfoToneFromInfo(statusInfo)}
                size="md"
                showIcon={true}
                style={styles.heroStatus}
              />
            </SectionCard>
          </Animated.View>

          <Animated.View
            style={{
              opacity: contentAnim,
              transform: [{
                translateY: contentAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [motion.screenEnterTranslateY, 0],
                })
              }]
            }}
          >
            {/* Failed/Refunded Status */}
            {isFailed && (
              <View style={styles.failedCard}>
                <View style={styles.failedIconContainer}>
                  <CircleX size={32} color={colors.error.main} strokeWidth={2} />
                </View>
                <Text style={styles.failedTitle}>
                  {transaction.status.toLowerCase().includes('refunded') 
                    ? 'Transaction Refunded' 
                    : transaction.status.toLowerCase().includes('returned')
                    ? 'Transaction Returned'
                    : 'Transaction Failed'}
                </Text>
                <Text style={styles.failedDescription}>
                  {transaction.status.toLowerCase().includes('refunded')
                    ? 'This transaction has been refunded to the sender.'
                    : transaction.status.toLowerCase().includes('returned')
                    ? 'This transaction was returned and could not be completed.'
                    : 'There was an issue with your transaction. Please contact support.'}
                </Text>
                
                <View style={styles.failedDetails}>
                  <View style={styles.failedDetailRow}>
                    <Text style={styles.failedDetailLabel}>Transaction ID</Text>
                    <Text style={styles.failedDetailValue}>{transaction.transaction_id}</Text>
                  </View>
                  <View style={styles.failedDetailRow}>
                    <Text style={styles.failedDetailLabel}>When</Text>
                    <Text style={styles.failedDetailValue}>{formatTimestamp(transaction.updated_at)}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Transaction Summary — rows render from existing transaction metadata only. */}
            <SectionCard style={styles.card}>
              <View style={styles.summaryRows}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Transaction ID</Text>
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={styles.copyableValueRow}
                    onPress={() => handleCopy(transaction.transaction_id, 'transactionId')}
                  >
                    <Text style={[styles.summaryValue, styles.summaryMonoValue]} selectable>
                      {transaction.transaction_id}
                    </Text>
                    <View style={[styles.copyIcon, copiedStates.transactionId && styles.copyIconSuccess]}>
                      {copiedStates.transactionId ? (
                        <Check size={14} color={colors.success.main} strokeWidth={2.5} />
                      ) : (
                        <Copy size={14} color={colors.primary.main} strokeWidth={2} />
                      )}
                    </View>
                  </Pressable>
                </View>

                {isEasetagP2p ? (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Scheme</Text>
                      <Text style={styles.summaryValue}>Easetag</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>When</Text>
                      <Text style={styles.summaryValue}>{formatTimestamp(easetagWhenTs)}</Text>
                    </View>
                  </>
                ) : null}

                {!isEasetagP2p && transaction.sender_display_name ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Sender</Text>
                    <Text style={styles.summaryValue}>{transaction.sender_display_name}</Text>
                  </View>
                ) : null}

                {/* For ACH/Wire deposits (virtual account) — not Easetag */}
                {!isEasetagP2p &&
                  transaction.transaction_type === 'receive' &&
                  transaction.source_type === 'virtual_account' && (
                  <>
                    {/* Scheme */}
                    {transaction.source_payment_rail && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Scheme</Text>
                        <Text style={styles.summaryValue}>
                          {formatScheme(transaction, transaction.source_payment_rail)}
                        </Text>
                      </View>
                    )}

                    {/* Narration */}
                    {transaction.reference && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Narration</Text>
                        <Text style={styles.summaryValue}>
                          {transaction.reference}
                        </Text>
                      </View>
                    )}

                    {/* When */}
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>When</Text>
                      <Text style={styles.summaryValue}>
                        {formatTimestamp(transaction.noah_created_at || transaction.created_at)}
                      </Text>
                    </View>
                  </>
                )}

                {/* Stablecoin deposits */}
                {!isEasetagP2p && transaction.transaction_type === 'receive' && transaction.source_type === 'liquidation_address' && (
                  <>
                    {/* Scheme - always show "USDC on SOL" or "EURC on SOL" */}
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Scheme</Text>
                      <Text style={styles.summaryValue}>
                        {formatScheme(transaction, transaction.source_payment_rail || 'solana')}
                      </Text>
                    </View>

                    {/* When */}
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>When</Text>
                      <Text style={styles.summaryValue}>
                        {formatTimestamp(transaction.noah_created_at || transaction.created_at)}
                      </Text>
                    </View>

                  </>
                )}

                {/* Send flows (non–Easetag P2P) */}
                {!isEasetagP2p && transaction.transaction_type === 'send' && (
                  <>
                    {transaction.final_amount && transaction.final_amount !== transaction.amount && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Final Amount</Text>
                        <Text style={styles.summaryValue}>
                          {formatAmount(transaction.final_amount, transaction.currency, isReceived)}
                        </Text>
                      </View>
                    )}

                    {transaction.source_payment_rail && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Scheme</Text>
                        <Text style={styles.summaryValue}>
                          {formatScheme(transaction, transaction.source_payment_rail)}
                        </Text>
                      </View>
                    )}

                    {transaction.recipient_name && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Recipient</Text>
                        <Text style={styles.summaryValue}>{transaction.recipient_name}</Text>
                      </View>
                    )}

                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>When</Text>
                      <Text style={styles.summaryValue}>
                        {formatTimestamp(transaction.noah_created_at || transaction.created_at)}
                      </Text>
                    </View>

                  </>
                )}
              </View>
            </SectionCard>
          </Animated.View>
        </ScrollView>

        {/* Bottom Actions — Send Again for sends; Get help only for receives. */}
        {transaction.transaction_type === 'send' ? (
          <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom + spacing[4], spacing[6]) }]}>
            <Pressable
              android_ripple={ripple.primaryTint}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
              onPress={handleSendAgain}
              accessibilityRole="button"
              accessibilityLabel="Send again"
            >
              <Text style={styles.primaryButtonText}>Send Again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom + spacing[4], spacing[6]) }]}>
            <Pressable
              android_ripple={ripple.neutral}
              style={({ pressed }) => [
                styles.outlineButton,
                pressed && styles.outlineButtonPressed,
              ]}
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.navigate('Support' as never)
              }}
              accessibilityRole="button"
              accessibilityLabel="Get help"
            >
              <HelpCircle size={18} color={colors.primary.main} strokeWidth={2.25} />
              <Text style={styles.outlineButtonText}>Get help</Text>
            </Pressable>
          </View>
        )}
      </View>
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
    paddingHorizontal: spacing[5],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.semantic.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[5],
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.error.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  errorTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  errorText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  retryButton: {
    backgroundColor: colors.primary.main,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
  },
  retryButtonText: {
    ...textStyles.titleSmall,
    color: colors.text.inverse,
  },
  /** White hero — 64px tinted-blue icon, title, amount, status pill, all centered. */
  heroAnimated: {
    marginTop: spacing[3],
    marginBottom: spacing[3],
  },
  heroCard: {
    alignItems: 'center',
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[5],
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 122, 204, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  heroTitle: {
    ...textStyles.titleMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
    textAlign: 'center',
    marginBottom: spacing[1],
  },
  heroAmount: {
    ...textStyles.displayLarge,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  heroAmountIn: {
    color: colors.success.main,
  },
  heroAmountOut: {
    color: colors.text.primary,
  },
  heroStatus: {
    alignSelf: 'center',
  },
  card: {
    marginBottom: spacing[3],
  },
  transactionIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionIdLabel: {
    ...textStyles.labelMedium,
    color: colors.text.tertiary,
  },
  transactionIdValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  transactionIdValue: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.mono,
  },
  copyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyIconSuccess: {
    backgroundColor: colors.success.background,
  },
  failedCard: {
    backgroundColor: colors.error.background,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    marginBottom: spacing[3],
    alignItems: 'center',
  },
  failedIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.neutral.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  failedTitle: {
    ...textStyles.titleLarge,
    color: colors.error.main,
    marginBottom: spacing[2],
  },
  failedDescription: {
    ...textStyles.bodyMedium,
    color: colors.error.dark,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  failedDetails: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.error.main + '30',
    paddingTop: spacing[3],
  },
  failedDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  failedDetailLabel: {
    ...textStyles.bodySmall,
    color: colors.error.dark,
  },
  failedDetailValue: {
    ...textStyles.titleSmall,
    color: colors.error.main,
    fontFamily: fontFamily.mono,
  },
  summaryRows: {
    gap: spacing[3],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  summaryValue: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing[2],
  },
  summaryMonoValue: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    fontWeight: '500',
  },
  copyableValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
    justifyContent: 'flex-end',
  },
  metadataText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.mono,
    backgroundColor: colors.semantic.muted,
    borderRadius: borderRadius.md,
    padding: spacing[3],
  },
  bottomContainer: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    backgroundColor: colors.semantic.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.default,
  },
  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    ...textStyles.titleMedium,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 15,
  },
  outlineButton: {
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.card,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  outlineButtonPressed: {
    opacity: 0.85,
    backgroundColor: colors.semantic.muted,
  },
  outlineButtonText: {
    ...textStyles.titleMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 15,
  },
})
