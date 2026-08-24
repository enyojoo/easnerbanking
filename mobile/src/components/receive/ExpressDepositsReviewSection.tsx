import React from 'react'
import { View, StyleSheet } from 'react-native'
import {
  buildExpressDepositsReviewRows,
  type ExpressDepositsPricingBreakdown,
} from '@easner/shared'
import type { ExpressCashKind } from './ReceiveCashMethodList'
import { TransactionDetailSummaryRow } from '../transactions/TransactionDetailSummaryRow'
import { spacing } from '../../theme'

type Props = {
  pricing: ExpressDepositsPricingBreakdown
  method: ExpressCashKind
}

export function ExpressDepositsReviewSection({ pricing, method }: Props) {
  const rows = buildExpressDepositsReviewRows({ pricing, method, surface: 'review' })
  return (
    <View style={styles.wrap}>
      {rows.map((row) => (
        <TransactionDetailSummaryRow
          key={row.id}
          label={row.label}
          value={row.value}
          valueBold={row.valueBold}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing[1],
  },
})
