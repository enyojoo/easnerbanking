import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { ArrowLeft, Check, Copy, Landmark, Smartphone } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  computeDisplayProcessingFee,
  computeYcFundBalancePrincipalLocalPayIn,
  formatMoneyDisplay,
  formatReviewRowMoneyDisplay,
  formatSendRateLabel,
  ycPayInInstructionNotice,
  YC_PAY_IN_MOMO_AUTHORIZE_CTA,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  REVIEW_ROW_LABELS,
} from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useFixedFooterPadding, useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles, borderRadius, surfaceFrameStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { ycBankInfoFields } from '../../lib/yc-bank-info-fields'
import { haptics } from '../../lib/haptics'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import {
  TransactionDetailSummaryRow,
  TransactionDetailCopyableValue,
} from '../../components/transactions/TransactionDetailSummaryRow'
import { CreditDestinationRow } from '../../components/transactions/CreditDestinationRow'

type RouteParams = {
  flowMode?: 'fund_balance' | 'cross_border_send'
  transactionId: string
  sendAmount?: number
  sendCurrency: string
  receiveAmount: number
  receiveCurrency: string
  recipientName?: string
  transferId: string
  localPayIn: number
  customerRate: number
  bankInfo: Record<string, unknown> | null
  payInNotice?: string
  payInRail?: YcPayInRail
  residenceCountry?: string
  processingFeeLocal?: number
  displayProcessingFee?: number
  processingFee?: number
  ycChannelFeeUsd?: number
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
}

function SendExactlyAmount({
  amount,
  centered,
}: {
  amount: string
  centered?: boolean
}) {
  return (
    <Text style={[styles.sendExactlyLine, centered && styles.sendExactlyLineCentered]}>
      {YC_PAY_IN_SEND_EXACTLY_LABEL}{' '}
      <Text style={styles.sendExactlyAmount}>{amount}</Text>
    </Text>
  )
}

export default function YcPayInScreen({ navigation, route }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const footerPadding = useFixedFooterPadding(spacing[5])
  const copyToClipboard = useCopyToClipboard()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const params = (route.params || {}) as Partial<RouteParams>
  const {
    flowMode = 'cross_border_send',
    transactionId,
    sendCurrency = 'NGN',
    receiveAmount = 0,
    receiveCurrency = 'USD',
    recipientName,
    transferId,
    localPayIn = 0,
    customerRate = 0,
    bankInfo,
    payInNotice,
    payInRail = 'bank_transfer',
    processingFeeLocal,
    displayProcessingFee,
    processingFee,
    ycChannelFeeUsd,
    sourcePhone,
    sourceNetworkName,
  } = params

  const isMobileMoney = payInRail === 'mobile_money'
  const fields = ycBankInfoFields(bankInfo)
  const isFundBalance = flowMode === 'fund_balance'
  const screenTitle = isFundBalance ? 'Complete deposit' : 'Complete payment'
  const formattedSendAmount = formatMoneyDisplay(localPayIn, sendCurrency)
  const formattedCreditAmount = formatMoneyDisplay(receiveAmount, receiveCurrency)
  const principalLocal =
    isFundBalance && customerRate > 0
      ? computeYcFundBalancePrincipalLocalPayIn({
          usdCredit: receiveAmount,
          exchangeRate: customerRate,
        })
      : 0
  const notice = payInNotice || ycPayInInstructionNotice(payInRail)
  const displayTransactionId = transactionId?.toUpperCase() ?? ''
  const feeLocal =
    processingFeeLocal ??
    (displayProcessingFee != null && customerRate > 0
      ? Math.round(displayProcessingFee * customerRate * 100) / 100
      : computeDisplayProcessingFee({
          processingFee: processingFee ?? 0,
          exchangeFee: ycChannelFeeUsd ?? 0,
        }) * (customerRate || 1))
  const transferMethod = isMobileMoney ? 'Mobile Money' : 'Bank Transfer'
  const ctaLabel = isMobileMoney ? YC_PAY_IN_MOMO_AUTHORIZE_CTA : "I've made the payment"

  const handleCopy = async (text: string, key: string) => {
    haptics.tap()
    await copyToClipboard(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  if (!transactionId || !transferId) {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary.main} />
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <View style={[styles.container, { paddingBottom: footerPadding }]}>
        <View style={styles.header}>
          <Pressable
            android_ripple={ripple.neutral}
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>{screenTitle}</Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            {displayTransactionId ? (
              <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.transactionId}>
                <TransactionDetailCopyableValue
                  value={displayTransactionId}
                  copied={copiedKey === 'transactionId'}
                  onPress={() => void handleCopy(displayTransactionId, 'transactionId')}
                  mono
                />
              </TransactionDetailSummaryRow>
            ) : null}
            {isFundBalance ? (
              <>
                {customerRate > 0 ? (
                  <TransactionDetailSummaryRow
                    label={REVIEW_ROW_LABELS.exchangeRate}
                    value={formatSendRateLabel('USD', sendCurrency, customerRate)}
                  />
                ) : null}
                {principalLocal > 0 ? (
                  <TransactionDetailSummaryRow
                    label={REVIEW_ROW_LABELS.depositAmount}
                    value={formatReviewRowMoneyDisplay(
                      REVIEW_ROW_LABELS.depositAmount,
                      principalLocal,
                      sendCurrency,
                    )}
                  />
                ) : null}
                {feeLocal > 0 ? (
                  <TransactionDetailSummaryRow
                    label={REVIEW_ROW_LABELS.processingFee}
                    value={formatReviewRowMoneyDisplay(
                      REVIEW_ROW_LABELS.processingFee,
                      feeLocal,
                      sendCurrency,
                    )}
                  />
                ) : null}
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.totalToPay}
                  value={formattedSendAmount}
                  valueBold
                />
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.amountToCredit}
                  value={formattedCreditAmount}
                  valueBold
                />
                <CreditDestinationRow
                  label={REVIEW_ROW_LABELS.creditTo}
                  currency="USD"
                  balanceLabel="USD Balance"
                />
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.transferMethod}
                  value={transferMethod}
                  last
                />
              </>
            ) : (
              <>
                {feeLocal > 0 ? (
                  <TransactionDetailSummaryRow
                    label={REVIEW_ROW_LABELS.processingFee}
                    value={formatReviewRowMoneyDisplay(
                      REVIEW_ROW_LABELS.processingFee,
                      feeLocal,
                      sendCurrency,
                    )}
                  />
                ) : null}
                {customerRate > 0 ? (
                  <TransactionDetailSummaryRow
                    label={REVIEW_ROW_LABELS.exchangeRate}
                    value={formatSendRateLabel(sendCurrency, receiveCurrency, customerRate)}
                  />
                ) : null}
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.recipientGets}
                  value={formattedCreditAmount}
                  valueBold
                />
                {recipientName ? (
                  <TransactionDetailSummaryRow
                    label={REVIEW_ROW_LABELS.recipient}
                    value={recipientName}
                  />
                ) : null}
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.transferMethod}
                  value={transferMethod}
                  last
                />
              </>
            )}
          </View>

          <View style={styles.payInCopySection}>
            <Text style={[styles.noticeText, styles.noticeTextCentered]}>{notice}</Text>
            <SendExactlyAmount amount={formattedSendAmount} centered />
          </View>

          <View style={[styles.paymentCard, surfaceFrameStyle(colors)]}>
            <View style={styles.paymentCardHeader}>
              {isMobileMoney ? (
                <Smartphone size={20} color={colors.primary.main} strokeWidth={2} />
              ) : (
                <Landmark size={20} color={colors.primary.main} strokeWidth={2} />
              )}
              <Text style={styles.paymentCardTitle}>
                {isMobileMoney ? 'Mobile Money' : 'Bank Account'}
              </Text>
            </View>
            {isMobileMoney ? (
              <>
                {sourceNetworkName ? (
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{REVIEW_ROW_LABELS.paymentNetwork}</Text>
                    <Text style={styles.fieldValue}>{sourceNetworkName}</Text>
                  </View>
                ) : null}
                {sourcePhone ? (
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{REVIEW_ROW_LABELS.mobileNumber}</Text>
                    <Text style={styles.fieldValue}>{sourcePhone}</Text>
                  </View>
                ) : null}
              </>
            ) : fields.length === 0 ? (
              <Text style={styles.emptyFields}>
                Payment details unavailable. Contact support with reference {displayTransactionId}.
              </Text>
            ) : (
              fields.map((field) => (
                <Pressable
                  key={field.id}
                  android_ripple={ripple.neutral}
                  style={styles.fieldRow}
                  onPress={() => void handleCopy(field.value, field.id)}
                >
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <View style={styles.fieldValueRow}>
                    <Text style={styles.fieldValue}>{field.value}</Text>
                    {copiedKey === field.id ? (
                      <Check size={16} color={colors.primary.main} strokeWidth={2} />
                    ) : (
                      <Copy size={16} color={colors.text.secondary} strokeWidth={2} />
                    )}
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>

        <Pressable
          android_ripple={ripple.neutral}
          style={styles.cta}
          onPress={() => {
            haptics.medium()
            navigation.navigate('TransactionDetails' as never, { transactionId } as never)
          }}
        >
          <LinearGradient
            colors={colors.primary.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  backButton: {
    padding: spacing[1],
  },
  title: {
    ...textStyles.screenTitle,
  },
  summaryCard: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    gap: spacing[1],
    marginBottom: spacing[4],
  },
  payInCopySection: {
    gap: spacing[4],
    marginBottom: spacing[5],
  },
  sendExactlyLine: {
    ...textStyles.body,
    color: colors.text.primary,
    marginBottom: spacing[4],
  },
  sendExactlyLineCentered: {
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing[2],
    marginBottom: 0,
  },
  sendExactlyAmount: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  noticeText: {
    ...textStyles.body,
    color: colors.text.primary,
  },
  noticeTextCentered: {
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing[2],
    marginBottom: 0,
  },
  paymentCard: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
  },
  paymentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  paymentCardTitle: {
    ...textStyles.sectionTitle,
  },
  emptyFields: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  fieldRow: {
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing[1],
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  fieldValue: {
    ...textStyles.body,
    fontFamily: 'monospace',
    flex: 1,
  },
  cta: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginTop: spacing[3],
  },
  ctaGradient: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  ctaText: {
    ...textStyles.button,
    color: colors.text.inverse,
  },
})
