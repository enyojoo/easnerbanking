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
import { useQueryClient } from '@tanstack/react-query'
import ScreenWrapper from '../../components/ScreenWrapper'
import { TransactionDetailsBodySkeleton } from '../../components/skeletons'
import {
  TransactionLifecycleTracker,
  type LifecycleStep,
} from '../../components/TransactionLifecycleTracker'
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
import { formatSignedCurrency } from '../../utils/formatters'
import {
  useTransactionDetail,
  useRecipientsList,
  prefetchNoahSendExchangeRates,
  seedTransactionDetailFromDisk,
  unwrapTransactionDetailPayload,
} from '../../hooks/queries'
import { useAuth } from '../../contexts/AuthContext'
import {
  resolveSendAgainAmountPrefill,
  resolveSendAgainRecipient,
} from '../../lib/resolveSendAgainRecipient'
import { isEasnerProductReceiveTitle, isEasnerProductSendTitle, isEasetagReceiveTitle, qk, scopeKey, formatMoneyDisplay, formatSendRateLabel, formatPayoutRecipientSubtitle, formatTransactionDetailHeroTitle, type GlobalPayoutReviewSnapshot, type GlobalPayoutRecipientSnapshot } from '@easner/shared'
import { ApiError } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { haptics } from '../../lib/haptics'
import { buildDynamicAmountTextStyle } from '../../lib/dynamicAmountFontSize'

interface LedgerTransaction {
  id: string
  transaction_id: string
  noah_transaction_id?: string
  transaction_type: 'send' | 'receive'
  direction: 'credit' | 'debit'
  amount: number
  currency: string
  final_amount?: number
  fee_amount?: number
  settled_amount?: number
  settled_currency?: string
  status: string
  source_type?: string
  source_payment_rail?: string
  destination_payment_rail?: string
  recipient_name?: string
  /** Saved recipient id when present on ledger row or in metadata. */
  recipient_id?: string
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
  lifecycle?: LifecycleStep[]
  deposit_amount?: number
  posted_amount?: number
  posted_currency?: string
  display_amount?: number
  display_currency?: string
  display_hero_title?: string
  display_description?: string
  ledger_amount?: number
  ledger_currency?: string
  payout_review?: GlobalPayoutReviewSnapshot
  recipient_snapshot?: GlobalPayoutRecipientSnapshot
  send_note?: string
  transaction_timing?: Array<{ label: string; value: string }>
  ledger_created_at?: string
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
  const { user } = useAuth()
  const recipientsQuery = useRecipientsList()
  const detailQuery = useTransactionDetail(transactionId)
  const copyToClipboard = useCopyToClipboard()
  const cachedListSnapshot = useMemo<LedgerTransaction | null>(() => {
    if (!scope || !transactionId) return null
    const entries = qc.getQueriesData<{
      pages?: Array<{ transactions?: Array<Record<string, unknown>> }>
    }>({
      queryKey: [...scopeKey(scope), 'transactions', 'list'],
      exact: false,
    })
    for (const [, listData] of entries) {
      if (!listData?.pages?.length) continue
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
    }
    return null
  }, [qc, scope, transactionId])
  const cachedDetailSnapshot = useMemo<LedgerTransaction | null>(() => {
    if (!scope || !transactionId) return null
    const fromQuery = unwrapTransactionDetailPayload(detailQuery.data ?? undefined)
    if (fromQuery) return fromQuery as unknown as LedgerTransaction
    const detailData = qc.getQueryData(qk.transactions.detail(scope, transactionId)) as
      | { transaction?: LedgerTransaction }
      | LedgerTransaction
      | undefined
    if (!detailData) return null
    return ((detailData as { transaction?: LedgerTransaction })?.transaction ??
      detailData) as LedgerTransaction
  }, [qc, scope, transactionId, detailQuery.data, detailQuery.dataUpdatedAt])

  const transaction = useMemo(
    () =>
      mergeTransactionSnapshots(
        initialTransaction ?? null,
        mergeTransactionSnapshots(cachedDetailSnapshot, cachedListSnapshot),
      ),
    [initialTransaction, cachedDetailSnapshot, cachedListSnapshot],
  )

  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({})

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
    if (!scope || !transactionId) return
    void seedTransactionDetailFromDisk(qc, scope, transactionId)
  }, [qc, scope, transactionId])

  useEffect(() => {
    if (!transactionId) return
    if (detailQuery.isError) {
      const err = detailQuery.error
      const msg =
        err instanceof ApiError
          ? err.status === 404
            ? 'Transaction not found'
            : err.message
          : 'Failed to load transaction details'
      setError(msg)
      return
    }
    if (detailQuery.data) {
      setError(null)
    }
  }, [transactionId, detailQuery.data, detailQuery.isError, detailQuery.error])

  const fetchTransactionDetails = useCallback(async () => {
    setError(null)
    try {
      const result = await detailQuery.refetch()
      const transactionData = unwrapTransactionDetailPayload(result.data ?? undefined)
      if (!transactionData && !transaction) {
        setError('Transaction not found')
      }
    } catch (err: unknown) {
      console.error('Error fetching transaction details:', err)
      if (!transaction) {
        setError('Failed to load transaction details')
      }
    }
  }, [detailQuery, transaction])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchTransactionDetails()
    } finally {
      setRefreshing(false)
    }
  }

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text)
    if (!ok) return
    haptics.success()
    setCopiedStates((prev) => ({ ...prev, [key]: true }))
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [key]: false }))
    }, 2000)
  }

  const formatAmount = (amount: number, currency: string, isReceived: boolean) =>
    formatSignedCurrency(amount, currency, isReceived)

  const heroAmountLabel = useMemo(() => {
    if (!transaction) return ''
    const amount = Number(transaction.display_amount ?? transaction.amount)
    const currency = String(transaction.display_currency ?? transaction.currency ?? 'USD')
    const received = transaction.transaction_type === 'receive'
    return formatSignedCurrency(amount, currency, received)
  }, [transaction])

  const heroAmountTextStyle = useMemo(() => {
    const received = transaction?.transaction_type === 'receive'
    return buildDynamicAmountTextStyle(
      [styles.heroAmount, received ? styles.heroAmountIn : styles.heroAmountOut],
      heroAmountLabel || '0',
      { maxSize: 48, minSize: 24 },
    )
  }, [heroAmountLabel, transaction?.transaction_type])

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
    let heroTitle = String(transaction.display_hero_title || '').trim()
    if (heroTitle.startsWith('Deposit from ') && isEasetagReceiveTitle(heroTitle.replace(/^Deposit from /i, ''))) {
      heroTitle = heroTitle.replace(/^Deposit from /i, '')
    }
    if (heroTitle) return heroTitle
    if (transaction.transaction_type === 'receive') {
      if (transaction.source_type === 'liquidation_address') {
        return 'Stablecoin Deposit'
      }
      const n = String(transaction.name || transaction.sender_display_name || '').trim()
      if (transaction.source_type === 'easetag_p2p' || isEasetagReceiveTitle(n)) {
        return n || 'Easetag Received'
      }
      const senderName = String(transaction.sender_display_name || transaction.name || '').trim()
      if (senderName) {
        return formatTransactionDetailHeroTitle({ direction: 'in', counterpartyName: senderName })
      }
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
          transaction.sender_display_name ||
          transaction.metadata?.sender_name ||
          transaction.metadata?.remitter_name ||
          transaction.metadata?.source?.sender_name ||
          transaction.metadata?.source?.originator_name ||
          transaction.name
        if (senderName && !isEasnerProductReceiveTitle(String(senderName))) {
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
    haptics.medium()
    const userId = user?.id
    if (!transaction || !userId) {
      navigation.navigate('SelectRecentRecipient' as never)
      return
    }

    const recipient = resolveSendAgainRecipient(
      transaction,
      recipientsQuery.data ?? [],
      userId,
    )
    if (!recipient) {
      navigation.navigate('SelectRecentRecipient' as never)
      return
    }

    void prefetchNoahSendExchangeRates(qc, recipient.currency)
    const pref = String(
      transaction.ledger_currency ||
        transaction.payout_review?.send_currency ||
        transaction.currency ||
        '',
    ).toUpperCase()
    const amountPrefill = resolveSendAgainAmountPrefill(transaction)
    navigation.navigate('SendAmount' as never, {
      recipient,
      fromSelectRecentRecipient: true,
      fromSendAgain: true,
      preferredBalanceCurrency: pref === 'USD' || pref === 'EUR' ? pref : undefined,
      ...(amountPrefill
        ? {
            initialSendAmount: amountPrefill.keypadAmount,
            initialAmountEntryMode: amountPrefill.amountEntryMode,
          }
        : {}),
    } as never)
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
            haptics.tap()
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
    detailQuery.isPending && (!transaction || !hasCoreDetailFields) && !error

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
                haptics.tap()
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
            <Pressable android_ripple={ripple.neutral} style={styles.retryButton} onPress={() => fetchTransactionDetails()}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      </ScreenWrapper>
    )
  }

  const isReceived = transaction.transaction_type === 'receive'
  const statusInfo = getStatusInfo(transaction.status)
  const isEasetagP2p = transaction.source_type === 'easetag_p2p'
  const isBankOnrampReceive =
    transaction.transaction_type === 'receive' &&
    (Boolean(transaction.lifecycle?.length) ||
      transaction.metadata?.flow === 'bank_onramp' ||
      transaction.source_type === 'virtual_account')
  const isGlobalPayoutSend =
    transaction.transaction_type === 'send' &&
    Boolean(transaction.payout_review || transaction.metadata?.payout_type === 'global_fiat')
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
              haptics.tap()
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
              <View style={styles.heroAmountSlot}>
                <Text
                  style={heroAmountTextStyle}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                >
                  {heroAmountLabel}
                </Text>
              </View>
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
                    {(() => {
                      const sendNote = String(
                        transaction.metadata?.send_note ??
                          transaction.metadata?.note ??
                          '',
                      ).trim()
                      if (!sendNote) return null
                      return (
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Note</Text>
                          <Text style={styles.summaryValue}>{sendNote}</Text>
                        </View>
                      )
                    })()}
                  </>
                ) : null}

                {!isEasetagP2p &&
                (() => {
                  const sendNote = String(
                    transaction.metadata?.send_note ?? transaction.metadata?.note ?? '',
                  ).trim()
                  if (!sendNote) return null
                  return (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Note</Text>
                      <Text style={styles.summaryValue}>{sendNote}</Text>
                    </View>
                  )
                })()}

                {!isEasetagP2p && !isBankOnrampReceive && transaction.sender_display_name ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Sender</Text>
                    <Text style={styles.summaryValue}>{transaction.sender_display_name}</Text>
                  </View>
                ) : null}

                {!isEasetagP2p && isBankOnrampReceive ? (
                  <>
                    {transaction.fee_amount != null && transaction.fee_amount > 0 ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Fee</Text>
                        <Text style={styles.summaryValue}>
                          {formatAmount(transaction.fee_amount, transaction.currency, false)}
                        </Text>
                      </View>
                    ) : null}
                    {(transaction.posted_amount ?? transaction.settled_amount) != null &&
                    (transaction.posted_amount ?? transaction.settled_amount)! > 0 ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Amount credited</Text>
                        <Text style={styles.summaryValue}>
                          {formatAmount(
                            transaction.posted_amount ?? transaction.settled_amount!,
                            transaction.posted_currency ||
                              transaction.settled_currency ||
                              transaction.currency,
                            true,
                          )}
                        </Text>
                      </View>
                    ) : null}
                    {transaction.source_payment_rail ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Scheme</Text>
                        <Text style={styles.summaryValue}>
                          {formatScheme(transaction, transaction.source_payment_rail)}
                        </Text>
                      </View>
                    ) : null}
                    {transaction.reference ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Narration</Text>
                        <Text style={styles.summaryValue}>{transaction.reference}</Text>
                      </View>
                    ) : null}
                    {transaction.transaction_timing?.map((row) => (
                      <View key={row.label} style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{row.label}</Text>
                        <Text style={styles.summaryValue}>{row.value}</Text>
                      </View>
                    ))}
                  </>
                ) : null}

                {!isEasetagP2p &&
                  !isBankOnrampReceive &&
                  transaction.transaction_type === 'receive' &&
                  transaction.source_type === 'virtual_account' && (
                  <>
                    {transaction.fee_amount != null && transaction.fee_amount > 0 && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Fee</Text>
                        <Text style={styles.summaryValue}>
                          {formatAmount(transaction.fee_amount, transaction.currency, false)}
                        </Text>
                      </View>
                    )}
                    {transaction.settled_amount != null && transaction.settled_amount > 0 && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Amount credited</Text>
                        <Text style={styles.summaryValue}>
                          {formatAmount(
                            transaction.settled_amount,
                            transaction.settled_currency || transaction.currency,
                            true,
                          )}
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
                    {transaction.reference && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Narration</Text>
                        <Text style={styles.summaryValue}>{transaction.reference}</Text>
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

                {/* Global payout send — review snapshot rows */}
                {isGlobalPayoutSend && transaction.payout_review ? (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>You send</Text>
                      <Text style={styles.summaryValue}>
                        {formatMoneyDisplay(
                          transaction.payout_review.you_send_amount,
                          transaction.payout_review.send_currency,
                        )}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Exchange fee</Text>
                      <Text style={styles.summaryValue}>
                        {formatMoneyDisplay(
                          transaction.payout_review.exchange_fee,
                          transaction.payout_review.send_currency,
                        )}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Processing fee</Text>
                      <Text style={styles.summaryValue}>
                        {formatMoneyDisplay(
                          transaction.payout_review.processing_fee,
                          transaction.payout_review.send_currency,
                        )}
                      </Text>
                    </View>
                    {transaction.payout_review.receive_currency.toUpperCase() !==
                    transaction.payout_review.send_currency.toUpperCase() ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Exchange rate</Text>
                        <Text style={styles.summaryValue}>
                          {formatSendRateLabel(
                            transaction.payout_review.send_currency,
                            transaction.payout_review.receive_currency,
                            transaction.payout_review.exchange_rate,
                          )}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Total debited</Text>
                      <Text style={styles.summaryValue}>
                        {formatMoneyDisplay(
                          transaction.payout_review.total_debited,
                          transaction.payout_review.send_currency,
                        )}
                      </Text>
                    </View>
                    {transaction.recipient_snapshot ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Recipient</Text>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={styles.summaryValue}>
                            {transaction.recipient_snapshot.full_name}
                          </Text>
                          {formatPayoutRecipientSubtitle({
                            bankName: transaction.recipient_snapshot.bank_name,
                            phone: transaction.recipient_snapshot.phone,
                            mobileProvider: transaction.recipient_snapshot.mobile_provider,
                            accountNumber: transaction.recipient_snapshot.account_number,
                            fullAccountNumber: transaction.recipient_snapshot.account_number,
                          }) ? (
                            <Text style={[styles.summaryValue, { fontSize: 13, color: colors.text.secondary }]}>
                              {formatPayoutRecipientSubtitle({
                                bankName: transaction.recipient_snapshot.bank_name,
                                phone: transaction.recipient_snapshot.phone,
                                mobileProvider: transaction.recipient_snapshot.mobile_provider,
                                accountNumber: transaction.recipient_snapshot.account_number,
                                fullAccountNumber: transaction.recipient_snapshot.account_number,
                              })}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Transfer method</Text>
                      <Text style={styles.summaryValue}>{transaction.payout_review.transfer_method}</Text>
                    </View>
                    {(transaction.transaction_timing?.length
                      ? transaction.transaction_timing
                      : [
                          {
                            label: 'Processing time',
                            value: transaction.payout_review.processing_time,
                          },
                        ]
                    ).map((row) => (
                      <View key={row.label} style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{row.label}</Text>
                        <Text style={styles.summaryValue}>{row.value}</Text>
                      </View>
                    ))}
                    {transaction.send_note || transaction.metadata?.send_note ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Note</Text>
                        <Text style={styles.summaryValue}>
                          {String(transaction.send_note || transaction.metadata?.send_note || '')}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : null}

                {/* Send flows (non–Easetag P2P, non–global payout) */}
                {!isEasetagP2p && !isGlobalPayoutSend && transaction.transaction_type === 'send' && (
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

            {(isBankOnrampReceive || isGlobalPayoutSend) &&
            transaction.lifecycle &&
            transaction.lifecycle.length > 0 ? (
              <SectionCard style={styles.card}>
                <TransactionLifecycleTracker
                  steps={transaction.lifecycle}
                  title={isGlobalPayoutSend ? 'Transfer status' : undefined}
                />
              </SectionCard>
            ) : null}
          </Animated.View>
        </ScrollView>

        {/* Bottom Actions — Send: Send again + Get help; Receive: Get help only. */}
        {transaction.transaction_type === 'send' ? (
          <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom + spacing[4], spacing[6]) }]}>
            <View style={styles.bottomActionsRow}>
              <Pressable
                android_ripple={ripple.primaryTint}
                style={({ pressed }) => [
                  styles.primaryButtonFlex,
                  pressed && styles.primaryButtonPressed,
                ]}
                onPress={handleSendAgain}
                accessibilityRole="button"
                accessibilityLabel="Send again"
              >
                <Text style={styles.primaryButtonText}>Send Again</Text>
              </Pressable>
              <Pressable
                android_ripple={ripple.neutral}
                style={({ pressed }) => [
                  styles.outlineButtonFlex,
                  pressed && styles.outlineButtonPressed,
                ]}
                onPress={async () => {
                  haptics.tap()
                  navigation.navigate('Support' as never)
                }}
                accessibilityRole="button"
                accessibilityLabel="Get help"
              >
                <HelpCircle size={18} color={colors.primary.main} strokeWidth={2.25} />
                <Text style={styles.outlineButtonText}>Get help</Text>
              </Pressable>
            </View>
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
                haptics.tap()
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
    borderRadius: borderRadius.full,
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
  heroAmountSlot: {
    width: '100%',
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
    paddingHorizontal: spacing[2],
  },
  heroAmount: {
    ...textStyles.displayLarge,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
    letterSpacing: -0.6,
    textAlign: 'center',
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
  bottomActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing[3],
  },
  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonFlex: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
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
  outlineButtonFlex: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
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
