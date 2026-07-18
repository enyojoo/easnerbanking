import React, { type ReactNode } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Landmark, Smartphone } from 'lucide-react-native'
import {
  colors,
  textStyles,
  borderRadius,
  spacing,
  fontFamily,
  surfaceFrameStyle,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'

type YcPayInShellWebFormProps = {
  screenTitle: string
  summary: ReactNode
  sendExactlyLine: ReactNode
  noticeText?: string | null
  isMobileMoney: boolean
  paymentDetails: ReactNode
  ctaLabel: string
  onContinue: () => void
}

export function YcPayInShellWebForm({
  screenTitle,
  summary,
  sendExactlyLine,
  noticeText,
  isMobileMoney,
  paymentDetails,
  ctaLabel,
  onContinue,
}: YcPayInShellWebFormProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.pageTitle}>{screenTitle}</Text>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Payment summary</Text>
        <View style={styles.summaryCard}>{summary}</View>
      </View>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Amount to pay</Text>
        <View style={styles.amountBox}>{sendExactlyLine}</View>
      </View>

      {noticeText ? (
        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Instructions</Text>
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{noticeText}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>{isMobileMoney ? 'Mobile money' : 'Bank account'}</Text>
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
      </View>

      <Pressable android_ripple={ripple.neutral} style={styles.cta} onPress={onContinue}>
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
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing[5],
  },
  pageTitle: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing[1],
  },
  section: {
    gap: spacing[2],
  },
  fieldLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  summaryCard: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    gap: spacing[1],
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  amountBox: {
    minHeight: 100,
    borderWidth: 2,
    borderColor: colors.border.light,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeBox: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  noticeText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    lineHeight: 20,
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
  cta: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginTop: spacing[1],
  },
  ctaGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    minHeight: 48,
  },
  ctaText: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: '#fff',
  },
})
