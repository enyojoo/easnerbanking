import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Check, Copy, Landmark, Smartphone } from 'lucide-react-native'
import {
  REVIEW_ROW_LABELS,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  formatMoneyDisplay,
  ycPayInCompleteNotice,
  type YcPayInRail,
} from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { ycBankInfoFields } from '../../lib/yc-bank-info-fields'
import { surfaceFrameStyle } from '../../theme'

type Props = {
  payInRail: YcPayInRail
  localPayIn: number
  localCurrency: string
  bankInfo?: Record<string, unknown> | null
  sourcePhone?: string
  sourceNetworkName?: string
  transactionId?: string
  copiedKey?: string | null
  onCopy?: (text: string, key: string) => void
}

/** Bank/MoMo payment instructions block for YC pay-in review (Noah-style terminal review). */
export function YcPayInPaymentBlock({
  payInRail,
  localPayIn,
  localCurrency,
  bankInfo,
  sourcePhone,
  sourceNetworkName,
  transactionId,
  copiedKey,
  onCopy,
}: Props) {
  const isMobileMoney = payInRail === 'mobile_money'
  const fields = ycBankInfoFields(bankInfo)
  const formattedSendAmount = formatMoneyDisplay(localPayIn, localCurrency)
  const completeNotice = ycPayInCompleteNotice(payInRail)
  const displayTransactionId = transactionId?.toUpperCase() ?? ''

  const paymentDetails = isMobileMoney ? (
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
        onPress={onCopy ? () => void onCopy(field.value, field.id) : undefined}
        disabled={!onCopy}
      >
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <View style={styles.fieldValueRow}>
          <Text style={styles.fieldValue}>{field.value}</Text>
          {onCopy ? (
            copiedKey === field.id ? (
              <Check size={16} color={colors.primary.main} strokeWidth={2} />
            ) : (
              <Copy size={16} color={colors.text.secondary} strokeWidth={2} />
            )
          ) : null}
        </View>
      </Pressable>
    ))
  )

  return (
    <>
      {(completeNotice || !isMobileMoney) ? (
        <View style={styles.payInCopySection}>
          {completeNotice ? (
            <Text style={[styles.noticeText, styles.noticeTextCentered]}>{completeNotice}</Text>
          ) : null}
          {!isMobileMoney ? (
            <Text style={[styles.sendExactlyLine, styles.sendExactlyLineCentered]}>
              {YC_PAY_IN_SEND_EXACTLY_LABEL}{' '}
              <Text style={styles.sendExactlyAmount}>{formattedSendAmount}</Text>
            </Text>
          ) : null}
        </View>
      ) : null}

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
        {paymentDetails}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  payInCopySection: {
    marginTop: spacing[3],
    marginBottom: spacing[2],
    gap: spacing[2],
  },
  noticeText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  noticeTextCentered: {
    textAlign: 'center',
  },
  sendExactlyLine: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
  },
  sendExactlyLineCentered: {
    textAlign: 'center',
  },
  sendExactlyAmount: {
    ...textStyles.screenTitle,
    fontSize: 20,
  },
  paymentCard: {
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginTop: spacing[2],
  },
  paymentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  paymentCardTitle: {
    ...textStyles.bodyMedium,
    fontFamily: textStyles.button.fontFamily,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flexShrink: 0,
  },
  fieldValue: {
    ...textStyles.caption,
    fontFamily: 'monospace',
    textAlign: 'right',
    flexShrink: 1,
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexShrink: 1,
    maxWidth: '65%',
  },
  emptyFields: {
    ...textStyles.caption,
    color: colors.text.secondary,
    paddingVertical: spacing[2],
  },
})
