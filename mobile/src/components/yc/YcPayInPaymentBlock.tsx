import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Landmark, Smartphone } from 'lucide-react-native'
import {
  REVIEW_ROW_LABELS,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  formatMoneyDisplay,
  ycPayInCompleteNotice,
  type YcPayInRail,
} from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ycBankInfoFields } from '../../lib/yc-bank-info-fields'
import {
  TransactionDetailSummaryRow,
  TransactionDetailCopyableValue,
} from '../transactions/TransactionDetailSummaryRow'

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

  const momoRows = [
    sourceNetworkName
      ? { id: 'network', label: REVIEW_ROW_LABELS.paymentNetwork, value: sourceNetworkName, copyable: false }
      : null,
    sourcePhone
      ? { id: 'phone', label: REVIEW_ROW_LABELS.mobileNumber, value: sourcePhone, copyable: false }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; value: string; copyable: boolean }>

  const bankRows =
    fields.length === 0
      ? []
      : fields.map((field) => ({
          id: field.id,
          label: field.label,
          value: field.value,
          copyable: Boolean(onCopy),
        }))

  const detailRows = isMobileMoney ? momoRows : bankRows
  const lastRowId = detailRows.at(-1)?.id

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

      <View style={styles.paymentCard}>
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

        {!isMobileMoney && detailRows.length === 0 ? (
          <Text style={styles.emptyFields}>
            Payment details unavailable. Contact support with reference {displayTransactionId}.
          </Text>
        ) : (
          detailRows.map((row) =>
            row.copyable && onCopy ? (
              <TransactionDetailSummaryRow key={row.id} label={row.label} last={row.id === lastRowId}>
                <TransactionDetailCopyableValue
                  value={row.value}
                  mono
                  copied={copiedKey === row.id}
                  onPress={() => void onCopy(row.value, row.id)}
                />
              </TransactionDetailSummaryRow>
            ) : (
              <TransactionDetailSummaryRow
                key={row.id}
                label={row.label}
                value={row.value}
                valueMono
                last={row.id === lastRowId}
              />
            ),
          )
        )}
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
    backgroundColor: colors.semantic.card,
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
  emptyFields: {
    ...textStyles.caption,
    color: colors.text.secondary,
    paddingVertical: spacing[2],
  },
})
