import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ReceiptVisualRow } from '@easner/shared'
import { REVIEW_ROW_LABELS } from '@easner/shared'
import { TransactionRecipientSummary } from '../transactions/TransactionRecipientSummary'
import { ReceiptBalanceDestinationValue } from './ReceiptBalanceDestinationValue'
import { transactionDetailRowStyles } from '../transactions/TransactionDetailSummaryRow'
import { colors, spacing } from '../../theme'

type Props = {
  row: ReceiptVisualRow
}

/** Rich receipt row — recipient chip or balance flag, matching transaction detail layout. */
export function ReceiptVisualRowValue({ row }: Props) {
  if (row.kind === 'recipient') {
    return (
      <View style={styles.recipientWrap}>
        <TransactionRecipientSummary
          recipientSnapshot={
            row.display.bankName || row.display.accountNumber
              ? {
                  full_name: row.display.fullName,
                  bank_name: row.display.bankName,
                  account_number: row.display.accountNumber,
                  phone: row.display.phone,
                  mobile_provider: row.display.mobileProvider,
                  country_code: row.display.countryCode,
                  currency: row.display.currency,
                }
              : undefined
          }
          recipientName={row.display.fullName}
          counterpartyName={row.display.fullName}
          counterpartyAddress={row.display.accountNumber}
          receiveNetwork={row.display.walletNetwork}
          receiveCurrency={row.display.walletAsset ?? row.display.currency}
          payeeEasetag={row.display.payeeEasetag}
          alignEnd
        />
      </View>
    )
  }

  if (row.kind === 'balanceDestination') {
    return (
      <ReceiptBalanceDestinationValue
        currency={row.currency}
        balanceLabel={row.balanceLabel}
      />
    )
  }

  if (row.label === REVIEW_ROW_LABELS.recipient) {
    const match = row.value.match(/^(.+?) \((.+)\)$/)
    if (match) {
      return (
        <View style={styles.valueStack}>
          <Text style={styles.valuePrimary}>{match[1].trim()}</Text>
          <Text style={styles.valueSecondary}>({match[2].trim()})</Text>
        </View>
      )
    }
  }

  return (
    <View style={styles.valueStack}>
      <Text style={styles.valuePrimary}>{row.value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  recipientWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  valueStack: {
    flex: 1,
    alignItems: 'flex-end',
  },
  valuePrimary: {
    ...transactionDetailRowStyles.value,
    flex: 0,
  },
  valueSecondary: {
    ...transactionDetailRowStyles.value,
    fontSize: 13,
    color: colors.text.secondary,
    flex: 0,
    marginTop: spacing[1],
  },
})