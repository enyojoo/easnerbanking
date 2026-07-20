import React from 'react'
import { Text, StyleSheet } from 'react-native'
import {
  YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED,
  formatYcPayInDepositTimeRemaining,
} from '@easner/shared'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { colors, textStyles } from '../../theme'

type Props = {
  depositExpiresAt?: string | null
}

export function YcPayInAwaitingPaymentCountdown({ depositExpiresAt }: Props) {
  const countdown = useQuoteCountdown(depositExpiresAt)
  if (!depositExpiresAt) return null

  if (countdown.expired) {
    return (
      <Text style={styles.expired}>{YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED}</Text>
    )
  }

  return (
    <Text style={styles.active}>
      {formatYcPayInDepositTimeRemaining(countdown.remainingMs)}
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
