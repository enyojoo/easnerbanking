import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  BackHandler,
  RefreshControl,
  Animated,
} from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  FileText,
  HelpCircle,
  Share2,
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
import { LazyTransactionReceiptSheet } from '../../components/receipt/LazyTransactionReceiptSheet'
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
import { useFixedFooterPadding } from '../../hooks/useScrollBottomPadding'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { ripple } from '../../lib/androidRipple'
import {
  colorForTransactionStatusTone,
  formatSignedCurrency,
  getTransactionStatusDisplay,
  type TransactionStatusTone,
} from '../../utils/formatters'
import {
  useTransactionDetail,
  useRecipientsList,
  seedTransactionDetailFromDisk,
  unwrapTransactionDetailPayload,
} from '../../hooks/queries'
import { prefetchSendRatesForRecipient } from '../../lib/warmSendRateCaches'
import { useAuth } from '../../contexts/AuthContext'
import {
  resolveSendAgainAmountPrefill,
  resolveSendAgainRecipient,
} from '../../lib/resolveSendAgainRecipient'
import {
  isEasnerProductReceiveTitle,
  isEasnerProductSendTitle,
  isEasetagReceiveTitle,
  qk,
  scopeKey,
  buildTransactionReceiptDetailRows,
  formatTransactionDetailHeroTitle,
  formatTransactionWhen,
  computeDisplayProcessingFee,
  hasPayoutCrossCurrencyFx,
  hasWalletSendFxDisplay,
  shouldShowPayoutReviewFeeRow,
  REVIEW_ROW_LABELS,
  resolveInboundReceiveDetail,
  resolvePayoutReviewFlow,
  type GlobalPayoutReviewSnapshot,
  type GlobalPayoutRecipientSnapshot,
  type YcFundBalanceDepositReviewSnapshot,
  useYcPayInExpiredDetailRefetch,
  isYcPayInAwaitingAttestation,
} from '@easner/shared'
import { InboundReceiveDetailRows } from '../../components/transactions/InboundReceiveDetailRows'
import { CrossBorderSendDetailRows } from '../../components/transactions/CrossBorderSendDetailRows'
import { PayoutReviewDetailRows } from '../../components/transactions/PayoutReviewDetailRows'
import { TransactionRecipientSummary } from '../../components/transactions/TransactionRecipientSummary'
import { TransactionDetailSummaryRow, TransactionDetailCopyableValue } from '../../components/transactions/TransactionDetailSummaryRow'
import { ApiError } from '../../query/api-client'
import { useScope, useIsRestoring } from '../../query'
import { haptics } from '../../lib/haptics'
import {
  navigateBackFromTransactionDetail,
  usesCustomTransactionDetailBack,
} from '../../navigation/transactionDetailNavigation'
import { YcPayInPaymentDetailsSheet } from '../../components/yc/YcPayInPaymentDetailsSheet'
import { buildDynamicAmountTextStyle } from '../../lib/dynamicAmountFontSize'
import { PayStubSheet } from '../../components/payroll/PayStubSheet'

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
  status_label?: string
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
  account_impact_amount?: number
  account_impact_currency?: string
  payout_review?: GlobalPayoutReviewSnapshot
  deposit_review?: YcFundBalanceDepositReviewSnapshot
  recipient_snapshot?: GlobalPayoutRecipientSnapshot
  send_note?: string
  transaction_timing?: Array<{ label: string; value: string }>
  ledger_created_at?: string
  provider?: string
  chain?: string
  yc_pay_in_payment_details?: import('@easner/shared').YcPayInPaymentDetails
  quote_expires_at?: string
}

type StatusInfo = {
  color: string
  Icon: LucideIcon
  label: string
  gradient: readonly [string, string]
}

function statusGradientForTone(tone: TransactionStatusTone): readonly [string, string] {
  switch (tone) {
    case 'completed':
      return colors.success.gradient
    case 'failed':
      return colors.error.gradient || colors.primary.gradient
    case 'pending':
    case 'processing':
      return colors.warning.gradient
    default:
      return colors.primary.gradient
  }
}

function statusIconForTone(tone: TransactionStatusTone): LucideIcon {
  switch (tone) {
    case 'completed':
      return CircleCheck
    case 'failed':
      return CircleX
    case 'pending':
    case 'processing':
      return Clock
    case 'cancelled':
      return CircleAlert
    default:
      return CircleHelp
  }
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
  const footerPadding = useFixedFooterPadding(spacing[4])
  // The action bar (bottomContainer) is a normal-flow view below the ScrollView, so the
  // scroll content only needs a small clearance above it — reserving the footer height
  // here too would leave a large empty gap below the last row (Share receipt).
  const scrollBottomPadding = spacing[6]
  const { transactionId, fromScreen, initialTransaction } = route.params as {
    transactionId: string
    fromScreen?: string
    initialTransaction?: LedgerTransaction | null
  }
  const handleBack = useCallback(() => {
    haptics.tap()
    navigateBackFromTransactionDetail(navigation, fromScreen)
  }, [navigation, fromScreen])
  useEffect(() => {
    if (Platform.OS !== 'android' || !usesCustomTransactionDetailBack(fromScreen)) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack()
      return true
    })
    return () => sub.remove()
  }, [fromScreen, handleBack])
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const { scope } = useScope()
  const isRestoring = useIsRestoring()
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

  const inboundReceive = useMemo(() => {
    if (!transaction || transaction.transaction_type !== 'receive') return null
    return resolveInboundReceiveDetail({
      provider: transaction.provider ?? transaction.metadata?.provider,
      direction: 'in',
      metadata: transaction.metadata,
      source_type: transaction.source_type,
      chain: transaction.chain ?? transaction.metadata?.chain,
      currency: transaction.currency,
      amount: transaction.amount,
      deposit_review: transaction.deposit_review,
      sender_display_name: transaction.sender_display_name,
      source_payment_rail: transaction.source_payment_rail,
      reference: transaction.reference,
      fee_amount: transaction.fee_amount,
      posted_amount: transaction.posted_amount,
      posted_currency: transaction.posted_currency,
      settled_amount: transaction.settled_amount,
      settled_currency: transaction.settled_currency,
      created_at: transaction.created_at,
      ledger_created_at: transaction.ledger_created_at,
      easner_transaction_id: transaction.transaction_id,
      send_note: transaction.send_note,
      display_description: transaction.display_description,
    })
  }, [transaction])

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  useLayoutEffect(() => {
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

  const refetchExpiredYcPayIn = useCallback(() => {
    void detailQuery.refetch()
  }, [detailQuery])

  useYcPayInExpiredDetailRefetch({
    enabled: Boolean(transaction),
    ledgerStatus: transaction?.status ?? '',
    quoteExpiresAt: transaction?.quote_expires_at,
    awaitingPayIn: isYcPayInAwaitingAttestation(
      transaction?.metadata,
      transaction?.status ?? '',
    ),
    onRefetch: refetchExpiredYcPayIn,
  })

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
    const amount = Number(
      transaction.display_amount ??
        transaction.posted_amount ??
        transaction.final_amount ??
        transaction.settled_amount ??
        transaction.receipt_final_amount ??
        transaction.amount,
    )
    const currency = String(
      transaction.display_currency ??
        transaction.posted_currency ??
        transaction.settled_currency ??
        transaction.currency ??
        'USD',
    )
    const received =
      transaction.transaction_type === 'receive' ||
      transaction.direction === 'credit' ||
      inboundReceive != null
    return formatSignedCurrency(amount, currency, received)
  }, [transaction, inboundReceive])

  const heroAmountTextStyle = useMemo(() => {
    const received =
      transaction?.transaction_type === 'receive' ||
      transaction?.direction === 'credit' ||
      inboundReceive != null
    return buildDynamicAmountTextStyle(
      [styles.heroAmount, received ? styles.heroAmountIn : styles.heroAmountOut],
      heroAmountLabel || '0',
      { maxSize: 48, minSize: 24 },
    )
  }, [heroAmountLabel, transaction?.transaction_type])

  const [receiptSheetOpen, setReceiptSheetOpen] = useState(false)
  const [payStubSheetOpen, setPayStubSheetOpen] = useState(false)
  const [ycPayInSheetOpen, setYcPayInSheetOpen] = useState(false)

  const formatTimestamp = (dateString: string, timeZone?: string) => {
    return formatTransactionWhen(dateString, timeZone ? { timeZone } : undefined)
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
    if (String(transaction.metadata?.product ?? '').toLowerCase() === 'payroll') {
      const businessName = String(transaction.metadata?.payroll_business_name ?? '').trim()
      return businessName ? `Payment from ${businessName}` : 'Payroll payment'
    }
    let heroTitle = String(transaction.display_hero_title || '').trim()
    if (heroTitle.startsWith('Deposit from ') && isEasetagReceiveTitle(heroTitle.replace(/^Deposit from /i, ''))) {
      heroTitle = heroTitle.replace(/^Deposit from /i, '')
    }
    if (heroTitle) return heroTitle.replace(/^Transfer to\s+/i, '')
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
      return String(transaction.name).trim().replace(/^Transfer to\s+/i, '')
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

  const getStatusInfo = (status: string, statusLabel?: string | null): StatusInfo & { tone: TransactionStatusTone } => {
    const mapped = getTransactionStatusDisplay(status, statusLabel)
    if (mapped) {
      return {
        color: colorForTransactionStatusTone(mapped.tone),
        Icon: statusIconForTone(mapped.tone),
        label: mapped.label,
        gradient: statusGradientForTone(mapped.tone),
        tone: mapped.tone,
      }
    }
    return {
      color: colors.text.secondary,
      Icon: CircleHelp,
      label: status.replace(/_/g, ' '),
      gradient: colors.primary.gradient,
      tone: 'neutral',
    }
  }

  const getTransactionName = (): string => {
    if (!transaction) return ''
    if (String(transaction.metadata?.product ?? '').toLowerCase() === 'payroll') {
      const businessName = String(transaction.metadata?.payroll_business_name ?? '').trim()
      return businessName ? `Payment from ${businessName}` : 'Payroll payment'
    }

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
      <TransactionDetailSummaryRow label={label}>
        <TransactionDetailCopyableValue
          value={value}
          copied={isCopied}
          onPress={() => handleCopy(value, fieldName)}
        />
      </TransactionDetailSummaryRow>
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

    prefetchSendRatesForRecipient(qc, recipient)
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
          onPress={handleBack}
          style={styles.backButton} >
          <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerContent}>
        </View>
      </Animated.View>
      
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <TransactionDetailsBodySkeleton />
      </ScrollView>
    </View>
  )

  // Prevent a partially-populated cached snapshot from rendering a mostly-empty UI.
  // If we don't have core fields yet, treat the view as loading until the detail query resolves.
  const shouldShowSkeleton =
    !error &&
    !hasCoreDetailFields &&
    ((isRestoring && !transaction) || detailQuery.isPending || !transaction)

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
              onPress={handleBack}
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
  const statusInfo = getStatusInfo(transaction.status, transaction.status_label)
  const isEasetagP2p = transaction.source_type === 'easetag_p2p'
  const isStablecoinReceive =
    transaction.transaction_type === 'receive' &&
    transaction.source_type === 'liquidation_address'
  const isYcFundBalanceDeposit =
    transaction.transaction_type === 'receive' && Boolean(transaction.deposit_review)
  const isBankOnrampReceive =
    !isYcFundBalanceDeposit &&
    !isStablecoinReceive &&
    transaction.transaction_type === 'receive' &&
    (Boolean(transaction.lifecycle?.length) ||
      transaction.metadata?.flow === 'bank_onramp' ||
      transaction.source_type === 'virtual_account')
  const isGlobalPayoutSend =
    transaction.transaction_type === 'send' &&
    Boolean(
      transaction.payout_review ||
        transaction.metadata?.payout_type === 'global_fiat' ||
        transaction.metadata?.activity_type === 'wallet_send',
    )
  const payoutReviewFlow = resolvePayoutReviewFlow(transaction.metadata)
  const depositSendNote = String(
    transaction.send_note ??
      transaction.metadata?.send_note ??
      transaction.metadata?.note ??
      '',
  ).trim()
  const whenTs =
    transaction.ledger_created_at ||
    transaction.created_at
  const walletSendReceiveNetwork = String(
    transaction.metadata?.receive_network ??
      transaction.metadata?.chain ??
      transaction.chain ??
      '',
  ).trim()
  const isWalletSendReview =
    transaction.metadata?.activity_type === 'wallet_send' ||
    transaction.payout_review?.execution_model === 'direct_turnkey' ||
    transaction.payout_review?.execution_model === 'lifi_bridge'
  const payoutReviewHasFx =
    transaction.payout_review &&
    (isWalletSendReview
      ? hasWalletSendFxDisplay(
          transaction.payout_review.send_currency,
          transaction.payout_review.receive_currency,
          walletSendReceiveNetwork,
        )
      : hasPayoutCrossCurrencyFx(
          transaction.payout_review.send_currency,
          transaction.payout_review.receive_currency,
        ))
  const showPayoutProcessingFee =
    !!transaction.payout_review &&
    shouldShowPayoutReviewFeeRow({
      processingFee: transaction.payout_review.processing_fee,
      exchangeFee: transaction.payout_review.exchange_fee,
    })
  const recipientSummaryNode = (
    <TransactionRecipientSummary
      recipientSnapshot={transaction.recipient_snapshot}
      recipientName={transaction.recipient_name}
      counterpartyName={
        typeof transaction.metadata?.counterparty_name === 'string'
          ? transaction.metadata.counterparty_name
          : null
      }
      counterpartyAddress={
        typeof transaction.metadata?.counterparty_address === 'string'
          ? transaction.metadata.counterparty_address
          : null
      }
      destinationAddress={
        typeof transaction.metadata?.destination_address === 'string'
          ? transaction.metadata.destination_address
          : null
      }
      receiveNetwork={walletSendReceiveNetwork || undefined}
      receiveCurrency={
        transaction.payout_review?.receive_currency ?? transaction.receive_currency
      }
      payeeEasetag={
        typeof transaction.metadata?.payee_easetag === 'string'
          ? transaction.metadata.payee_easetag
          : null
      }
    />
  )
  const payoutLocalFee =
    payoutReviewFlow === 'local_pay_in'
      ? transaction.payout_review?.display_processing_fee_local != null &&
        transaction.payout_review.display_processing_fee_local > 0
        ? transaction.payout_review.display_processing_fee_local
        : Number(transaction.metadata?.display_processing_fee_local) > 0
          ? Number(transaction.metadata.display_processing_fee_local)
          : null
      : null
  const payoutDisplayProcessingFee = transaction.payout_review
    ? payoutLocalFee ??
      computeDisplayProcessingFee({
        processingFee: transaction.payout_review.processing_fee,
        exchangeFee: transaction.payout_review.exchange_fee,
      })
    : 0
  const ycDepositReview = transaction.deposit_review
  const ycFeeLocal =
    ycDepositReview?.display_processing_fee_local != null &&
    ycDepositReview.display_processing_fee_local > 0
      ? ycDepositReview.display_processing_fee_local
      : Number(transaction.metadata?.display_processing_fee_local) > 0
        ? Number(transaction.metadata?.display_processing_fee_local)
        : null
  const ycDisplayProcessingFee = ycDepositReview
    ? ycFeeLocal ??
      computeDisplayProcessingFee({
        processingFee: ycDepositReview.processing_fee,
        exchangeFee: ycDepositReview.exchange_fee,
      })
    : 0
  const showYcDepositProcessingFee =
    !!ycDepositReview &&
    shouldShowPayoutReviewFeeRow({
      processingFee: ycDepositReview.processing_fee,
      exchangeFee: ycDepositReview.exchange_fee,
    })
  // Downloadable receipt (image) — completed payouts and supported deposits only.
  // Stablecoin and Easetag deposits intentionally do not offer transaction receipts.
  const receiptRows =
    transaction.status === 'completed' && !isEasetagP2p && !isStablecoinReceive
      ? buildTransactionReceiptDetailRows(
          isGlobalPayoutSend && transaction.payout_review
            ? {
                direction: 'out',
                payoutReview: transaction.payout_review,
                payoutReviewFlow: resolvePayoutReviewFlow(transaction.metadata),
                receiveNetwork: isWalletSendReview ? walletSendReceiveNetwork : undefined,
                recipientSnapshot: transaction.recipient_snapshot,
                counterpartyName:
                  typeof transaction.metadata?.counterparty_name === 'string'
                    ? transaction.metadata.counterparty_name
                    : null,
                counterpartyAddress:
                  typeof transaction.metadata?.counterparty_address === 'string'
                    ? transaction.metadata.counterparty_address
                    : null,
                destinationAddress:
                  typeof transaction.metadata?.destination_address === 'string'
                    ? transaction.metadata.destination_address
                    : null,
                recipient: transaction.recipient_snapshot
                  ? {
                      fullName: transaction.recipient_snapshot.full_name,
                      bankName: transaction.recipient_snapshot.bank_name,
                      accountNumber: transaction.recipient_snapshot.account_number,
                      phone: transaction.recipient_snapshot.phone,
                      mobileProvider: transaction.recipient_snapshot.mobile_provider,
                      walletNetwork: walletSendReceiveNetwork || undefined,
                    }
                  : isWalletSendReview
                    ? {
                        fullName: String(
                          transaction.display_description ||
                            transaction.name ||
                            transaction.metadata?.counterparty_name ||
                            'Wallet transfer',
                        ),
                        bankName: 'Wallet',
                        accountNumber:
                          transaction.metadata?.counterparty_address ||
                          transaction.metadata?.destination_address,
                        walletNetwork: walletSendReceiveNetwork || undefined,
                      }
                    : undefined,
              }
            : inboundReceive && inboundReceive.kind !== 'easetag_receive'
              ? { direction: 'in', inboundReceive }
              : isYcFundBalanceDeposit && ycDepositReview
                ? { direction: 'in', depositReview: ycDepositReview }
                : isBankOnrampReceive || isStablecoinReceive
                  ? {
                      direction: 'in',
                      deposit: {
                        scheme: formatScheme(
                          transaction,
                          transaction.source_payment_rail || (isStablecoinReceive ? 'solana' : ''),
                        ),
                        senderDisplay: transaction.sender_display_name,
                        feeAmount: transaction.fee_amount,
                        feeCurrency: transaction.currency,
                        postedAmount: transaction.posted_amount ?? transaction.settled_amount,
                        postedCurrency:
                          transaction.posted_currency ||
                          transaction.settled_currency ||
                          transaction.currency,
                        narration: transaction.reference,
                      },
                    }
                  : { direction: null },
        )
      : []
  const receiptEligible = receiptRows.length > 0
  const payrollDocumentId = String(transaction.metadata?.payroll_document_id ?? '').trim()
  const isPayrollPayment = String(transaction.metadata?.product ?? '').toLowerCase() === 'payroll'

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
            onPress={handleBack}
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
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
                tone={statusInfo.tone}
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
                <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.transactionId}>
                  <TransactionDetailCopyableValue
                    value={transaction.transaction_id}
                    copied={copiedStates.transactionId}
                    mono
                    onPress={() => handleCopy(transaction.transaction_id, 'transactionId')}
                  />
                </TransactionDetailSummaryRow>

                {isPayrollPayment ? (
                  <>
                    <TransactionDetailSummaryRow label="Category" value="Payroll payment" />
                    <TransactionDetailSummaryRow
                      label="Employer"
                      value={String(transaction.metadata?.payroll_business_name ?? 'Easner Business')}
                    />
                    {transaction.metadata?.payroll_period_start && transaction.metadata?.payroll_period_end ? (
                      <TransactionDetailSummaryRow
                        label="Pay period"
                        value={`${transaction.metadata.payroll_period_start} – ${transaction.metadata.payroll_period_end}`}
                      />
                    ) : null}
                    {transaction.metadata?.payroll_payday ? (
                      <TransactionDetailSummaryRow
                        label="Payday"
                        value={String(transaction.metadata.payroll_payday)}
                      />
                    ) : null}
                    {transaction.metadata?.payroll_scheduled_at ? (
                      <TransactionDetailSummaryRow
                        label="Scheduled payment"
                        value={formatTimestamp(
                          String(transaction.metadata.payroll_scheduled_at),
                          String(transaction.metadata?.payroll_timezone || 'UTC'),
                        )}
                      />
                    ) : null}
                    <TransactionDetailSummaryRow label="Receiving method" value="EASETAG" />
                    <TransactionDetailSummaryRow
                      label="Payroll reference"
                      value={String(transaction.metadata?.payroll_reference ?? '')}
                    />
                    <TransactionDetailSummaryRow
                      label="Paid on"
                      value={formatTimestamp(
                        whenTs,
                        String(transaction.metadata?.payroll_timezone || 'UTC'),
                      )}
                    />
                  </>
                ) : inboundReceive ? <InboundReceiveDetailRows snapshot={inboundReceive} /> : null}

                {/* Outbound Easetag — inbound uses InboundReceiveDetailRows; send was dropped in that unification. */}
                {isEasetagP2p && !inboundReceive ? (
                  <>
                    <TransactionDetailSummaryRow
                      label={REVIEW_ROW_LABELS.scheme}
                      value="Easetag"
                    />
                    {(() => {
                      const payeeTag = String(
                        transaction.metadata?.payee_easetag ?? '',
                      )
                        .trim()
                        .replace(/^@+/, '')
                      if (!payeeTag && !transaction.recipient_name) return null
                      return (
                        <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.recipient}>
                          {recipientSummaryNode}
                        </TransactionDetailSummaryRow>
                      )
                    })()}
                    <TransactionDetailSummaryRow
                      label={REVIEW_ROW_LABELS.when}
                      value={formatTimestamp(whenTs)}
                    />
                    {depositSendNote ? (
                      <TransactionDetailSummaryRow
                        label={REVIEW_ROW_LABELS.note}
                        value={depositSendNote}
                      />
                    ) : null}
                  </>
                ) : null}

                {!inboundReceive &&
                !isEasetagP2p &&
                !isBankOnrampReceive &&
                !isStablecoinReceive &&
                !isYcFundBalanceDeposit &&
                transaction.sender_display_name ? (
                  <TransactionDetailSummaryRow
                    label={REVIEW_ROW_LABELS.sender}
                    value={transaction.sender_display_name}
                  />
                ) : null}

                {!inboundReceive &&
                  !isEasetagP2p &&
                  !isBankOnrampReceive &&
                  !isYcFundBalanceDeposit &&
                  transaction.transaction_type === 'receive' &&
                  transaction.source_type === 'virtual_account' && (
                  <>
                    {transaction.fee_amount != null && transaction.fee_amount > 0 && (
                      <TransactionDetailSummaryRow
                        label={REVIEW_ROW_LABELS.processingFee}
                        value={formatAmount(transaction.fee_amount, transaction.currency, false)}
                      />
                    )}
                    {transaction.settled_amount != null && transaction.settled_amount > 0 && (
                      <TransactionDetailSummaryRow
                        label={REVIEW_ROW_LABELS.amountCredited}
                        value={formatAmount(
                          transaction.settled_amount,
                          transaction.settled_currency || transaction.currency,
                          true,
                        )}
                        valueBold
                      />
                    )}
                    {transaction.source_payment_rail && (
                      <TransactionDetailSummaryRow
                        label={REVIEW_ROW_LABELS.scheme}
                        value={formatScheme(transaction, transaction.source_payment_rail)}
                      />
                    )}
                    {transaction.reference && (
                      <TransactionDetailSummaryRow
                        label={REVIEW_ROW_LABELS.narration}
                        value={transaction.reference}
                      />
                    )}
                    <TransactionDetailSummaryRow
                      label={REVIEW_ROW_LABELS.when}
                      value={formatTimestamp(whenTs)}
                    />
                  </>
                )}

                {/* Global payout send — review snapshot rows */}
                {isGlobalPayoutSend && transaction.payout_review ? (
                  payoutReviewFlow === 'local_pay_in' ? (
                    <CrossBorderSendDetailRows
                      payoutReview={transaction.payout_review}
                      recipientSnapshot={transaction.recipient_snapshot}
                      displayProcessingFee={payoutDisplayProcessingFee}
                      whenTs={whenTs}
                      formatTimestamp={formatTimestamp}
                      recipientNode={recipientSummaryNode}
                    />
                  ) : (
                  <PayoutReviewDetailRows
                    payoutReview={transaction.payout_review}
                    payoutReviewFlow={payoutReviewFlow}
                    recipientSnapshot={transaction.recipient_snapshot}
                    recipientNode={recipientSummaryNode}
                    showProcessingFee={showPayoutProcessingFee}
                    displayProcessingFee={payoutDisplayProcessingFee}
                    hasFx={!!payoutReviewHasFx}
                    walletSendReceiveNetwork={walletSendReceiveNetwork}
                    isWalletSendReview={isWalletSendReview}
                    showRecipientGets={false}
                    displayDescription={transaction.display_description}
                    name={transaction.name}
                    counterpartyName={
                      typeof transaction.metadata?.counterparty_name === 'string'
                        ? transaction.metadata.counterparty_name
                        : null
                    }
                    counterpartyAddress={
                      typeof transaction.metadata?.counterparty_address === 'string'
                        ? transaction.metadata.counterparty_address
                        : null
                    }
                    destinationAddress={
                      typeof transaction.metadata?.destination_address === 'string'
                        ? transaction.metadata.destination_address
                        : null
                    }
                    whenTs={whenTs}
                    sendNote={String(
                      transaction.send_note || transaction.metadata?.send_note || '',
                    ).trim() || null}
                    formatTimestamp={formatTimestamp}
                  />
                  )
                ) : null}

                {/* Send flows (non–Easetag P2P, non–global payout) */}
                {!isEasetagP2p && !isGlobalPayoutSend && transaction.transaction_type === 'send' && (
                  <>
                    {transaction.final_amount && transaction.final_amount !== transaction.amount && (
                      <TransactionDetailSummaryRow
                        label="Final Amount"
                        value={formatAmount(transaction.final_amount, transaction.currency, isReceived)}
                      />
                    )}

                    {transaction.source_payment_rail && (
                      <TransactionDetailSummaryRow
                        label={REVIEW_ROW_LABELS.scheme}
                        value={formatScheme(transaction, transaction.source_payment_rail)}
                      />
                    )}

                    {transaction.recipient_name && (
                      <TransactionDetailSummaryRow
                        label={REVIEW_ROW_LABELS.recipient}
                        value={transaction.recipient_name}
                      />
                    )}

                    <TransactionDetailSummaryRow
                      label={REVIEW_ROW_LABELS.when}
                      value={formatTimestamp(whenTs)}
                    />

                    {depositSendNote ? (
                      <TransactionDetailSummaryRow
                        label={REVIEW_ROW_LABELS.note}
                        value={depositSendNote}
                      />
                    ) : null}
                  </>
                )}
              </View>
            </SectionCard>

            {/* Stablecoin deposits settle on-chain in a single event, so the Processing → Completed
                tracker would always render both steps complete. Skip it (bank deposits keep it). */}
            {(inboundReceive ||
              isGlobalPayoutSend ||
              isBankOnrampReceive ||
              isYcFundBalanceDeposit) &&
            transaction.lifecycle &&
            transaction.lifecycle.length > 0 &&
            (!inboundReceive ||
              (inboundReceive.kind !== 'stablecoin' &&
                inboundReceive.kind !== 'easetag_receive')) ? (
              <SectionCard style={styles.card}>
                <TransactionLifecycleTracker
                  steps={transaction.lifecycle}
                  title={isGlobalPayoutSend ? 'Transfer status' : 'Deposit status'}
                  ycPayInPaymentDetails={transaction.yc_pay_in_payment_details}
                  quoteExpiresAt={transaction.quote_expires_at}
                  onPaymentDetailsLinkPress={() => setYcPayInSheetOpen(true)}
                />
              </SectionCard>
            ) : null}

            {/* Receipt (image) — completed, non-Easetag only. Business web keeps the PDF.
                One entry that opens a preview + Share/Save sheet (the share sheet itself
                includes Save to Photos/Files). */}
            {receiptEligible ? (
              <View style={styles.receiptActions}>
                <Pressable
                  android_ripple={ripple.neutral}
                  style={({ pressed }) => [
                    styles.outlineButton,
                    pressed && styles.outlineButtonPressed,
                  ]}
                  onPress={() => {
                    haptics.tap()
                    setReceiptSheetOpen(true)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Share receipt"
                >
                  <Share2 size={18} color={colors.primary.main} strokeWidth={2.25} />
                  <Text style={styles.outlineButtonText}>Share receipt</Text>
                </Pressable>
              </View>
            ) : null}
            {isPayrollPayment && payrollDocumentId ? (
              <View style={styles.receiptActions}>
                <Pressable
                  android_ripple={ripple.neutral}
                  style={({ pressed }) => [styles.outlineButton, pressed && styles.outlineButtonPressed]}
                  onPress={() => {
                    haptics.tap()
                    setPayStubSheetOpen(true)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="View pay stub"
                >
                  <FileText size={18} color={colors.primary.main} strokeWidth={2.25} />
                  <Text style={styles.outlineButtonText}>Pay stub</Text>
                </Pressable>
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>

        {receiptEligible ? (
          <LazyTransactionReceiptSheet
            visible={receiptSheetOpen}
            onClose={() => setReceiptSheetOpen(false)}
            receipt={{
              title: getTransactionTypeDisplay(),
              amountText: heroAmountLabel,
              isCredit: isReceived,
              statusLabel: statusInfo.label,
              outcome: transaction.status === 'completed' ? 'success' : 'failed',
              dateText: formatTimestamp(whenTs),
              rows: receiptRows,
              transactionId: transaction.transaction_id,
            }}
          />
        ) : null}
        {isPayrollPayment && payrollDocumentId ? (
          <PayStubSheet
            visible={payStubSheetOpen}
            documentId={payrollDocumentId}
            onClose={() => setPayStubSheetOpen(false)}
          />
        ) : null}

        {transaction.yc_pay_in_payment_details ? (
          <YcPayInPaymentDetailsSheet
            visible={ycPayInSheetOpen}
            onClose={() => setYcPayInSheetOpen(false)}
            details={transaction.yc_pay_in_payment_details}
          />
        ) : null}

        {/* Bottom Actions — Send: Send again + Get help; Receive: Get help only. */}
        {transaction.transaction_type === 'send' ? (
          <View style={[styles.bottomContainer, { paddingBottom: Math.max(footerPadding, spacing[6]) }]}>
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
          <View style={[styles.bottomContainer, { paddingBottom: Math.max(footerPadding, spacing[6]) }]}>
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
  summaryRows: {},
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
  receiptActions: {
    marginTop: spacing[4],
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
