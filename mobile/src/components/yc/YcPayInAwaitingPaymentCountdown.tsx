import React from 'react'
import { Text, StyleSheet } from 'react-native'
import {
  YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED,
  YC_PAY_IN_REVIEW_PAYMENT_WINDOW_EXPIRED,
  formatYcPayInPaymentCountdownFromExpiry,
} from '@easner/shared'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { colors, textStyles } from '../../theme'

type Props = {
  depositExpiresAt?: string | null
  /** Review & Complete uses restart copy; detail/sheet uses support copy. */
  context?: 'review' | 'detail'
}

export function YcPayInAwaitingPaymentCountdown({
  depositExpiresAt,
  context = 'detail',
}: Props) {
  const countdown = useQuoteCountdown(depositExpiresAt)
  if (!depositExpiresAt) return null

  if (countdown.expired) {
    const expiredCopy =
      context === 'review'
        ? YC_PAY_IN_REVIEW_PAYMENT_WINDOW_EXPIRED
        : YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED
    return <Text style={styles.expired}>{expiredCopy}</Text>
  }

  return (
    <Text style={styles.active}>
      {formatYcPayInPaymentCountdownFromExpiry(depositExpiresAt, {
        nowMs: countdown.nowMs,
      })}
    </Text>
  )
}

const styles = StyleSheet.create({
  active: {
    ...textStyles.bodySmall,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: colors.warning.main,
    textAlign: 'center',
  },
  expired: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    textAlign: 'center',
  },
})
