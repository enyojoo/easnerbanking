import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { ArrowUp, RefreshCw, CircleCheck, CircleX } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  YC_PAY_IN_AWAITING_DESCRIPTION_LINK,
  YC_PAY_IN_AWAITING_DESCRIPTION_SUFFIX,
  formatYcPayInDepositTimeRemaining,
  type YcPayInPaymentDetails,
} from '@easner/shared'
import { colors, textStyles, spacing } from '../theme'
import { useQuoteCountdown } from '../hooks/useQuoteCountdown'

export type LifecycleStep = {
  id: string
  title: string
  description: string
  state: 'complete' | 'current' | 'upcoming'
  occurredAt: string | null
  showPaymentDetailsLink?: boolean
}

function StageGlyph({
  glyph,
  size,
  color,
}: {
  glyph: string
  size: number
  color: string
}) {
  const p = { size, color, strokeWidth: 2 as const }
  switch (glyph) {
    case 'arrow-up':
      return <ArrowUp {...p} />
    case 'sync':
      return <RefreshCw {...p} />
    case 'checkmark-circle':
      return <CircleCheck {...p} />
    case 'failed':
      return <CircleX {...p} />
    default:
      return <RefreshCw {...p} />
  }
}

function glyphForStep(id: string): string {
  if (id === 'completed') return 'checkmark-circle'
  if (id === 'failed') return 'failed'
  return 'sync'
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = date.getDate().toString().padStart(2, '0')
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${month} ${day}, ${year} • ${displayHours}:${minutes} ${ampm}`
}

type Props = {
  steps: LifecycleStep[]
  title?: string
  ycPayInPaymentDetails?: YcPayInPaymentDetails | null
  quoteExpiresAt?: string | null
  onPaymentDetailsLinkPress?: () => void
}

export function TransactionLifecycleTracker({
  steps,
  title = 'Deposit status',
  ycPayInPaymentDetails,
  quoteExpiresAt,
  onPaymentDetailsLinkPress,
}: Props) {
  const quoteCountdown = useQuoteCountdown(quoteExpiresAt)

  if (!steps.length) return null

  return (
    <View>
      <Text style={styles.timelineTitle}>{title}</Text>
      {steps.map((stage, index) => {
        const isComplete = stage.state === 'complete'
        const isCurrent = stage.state === 'current'
        const showActive = isComplete || isCurrent
        const isLast = index === steps.length - 1
        const showDepositTimer =
          stage.id === 'awaiting_transfer' &&
          isCurrent &&
          Boolean(quoteExpiresAt) &&
          !quoteCountdown.expired
        const showLink =
          stage.showPaymentDetailsLink && ycPayInPaymentDetails && onPaymentDetailsLinkPress
        return (
          <View
            key={stage.id}
            style={[styles.stageContainer, isLast ? styles.stageContainerLast : null]}
          >
            <View style={styles.iconContainer}>
              {showActive ? (
                <LinearGradient
                  colors={
                    stage.id === 'failed'
                      ? [colors.error.main, colors.error.main]
                      : colors.success.gradient
                  }
                  style={styles.iconCircle}
                >
                  <StageGlyph glyph={glyphForStep(stage.id)} size={18} color={colors.text.inverse} />
                </LinearGradient>
              ) : (
                <View style={styles.iconCirclePending}>
                  <StageGlyph glyph={glyphForStep(stage.id)} size={18} color={colors.neutral[400]} />
                </View>
              )}
              {index < steps.length - 1 && (
                <View
                  style={[
                    styles.connectingLine,
                    isComplete ? styles.connectingLineCompleted : styles.connectingLinePending,
                  ]}
                />
              )}
            </View>
            <View style={styles.contentContainer}>
              <Text
                style={[
                  styles.title,
                  showActive ? styles.titleCompleted : styles.titlePending,
                ]}
              >
                {stage.title}
                {showDepositTimer ? (
                  <Text style={styles.depositTimer}>
                    {' · '}
                    {formatYcPayInDepositTimeRemaining(quoteCountdown.remainingMs)}
                  </Text>
                ) : null}
              </Text>
              {stage.occurredAt ? (
                <Text style={styles.timestamp}>{formatTimestamp(stage.occurredAt)}</Text>
              ) : null}
              <Text
                style={[
                  styles.description,
                  showActive ? styles.descriptionCompleted : styles.descriptionPending,
                ]}
              >
                {showLink ? (
                  <>
                    {stage.description}
                    <Text
                      style={styles.link}
                      onPress={onPaymentDetailsLinkPress}
                      accessibilityRole="link"
                    >
                      {YC_PAY_IN_AWAITING_DESCRIPTION_LINK}
                    </Text>
                    {YC_PAY_IN_AWAITING_DESCRIPTION_SUFFIX}
                  </>
                ) : (
                  stage.description
                )}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  timelineTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  depositTimer: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: colors.warning.main,
  },
  stageContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing[4],
  },
  stageContainerLast: {
    marginBottom: 0,
  },
  iconContainer: {
    alignItems: 'center',
    marginRight: spacing[4],
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCirclePending: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.neutral[100],
    borderWidth: 2,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectingLine: {
    width: 2,
    flex: 1,
    minHeight: spacing[4],
    marginTop: spacing[2],
  },
  connectingLineCompleted: {
    backgroundColor: colors.success.main,
  },
  connectingLinePending: {
    backgroundColor: colors.border.default,
  },
  contentContainer: {
    flex: 1,
    paddingTop: spacing[2],
  },
  title: {
    ...textStyles.titleSmall,
    marginBottom: spacing[1],
  },
  titleCompleted: {
    color: colors.text.primary,
  },
  titlePending: {
    color: colors.text.tertiary,
  },
  timestamp: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing[1],
  },
  description: {
    ...textStyles.bodyMedium,
  },
  descriptionCompleted: {
    color: colors.text.secondary,
  },
  descriptionPending: {
    color: colors.text.tertiary,
  },
  link: {
    textDecorationLine: 'underline',
    color: colors.text.primary,
  },
})
