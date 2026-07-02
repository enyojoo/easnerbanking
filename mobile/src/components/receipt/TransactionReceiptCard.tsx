import React, { forwardRef } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Check, X } from 'lucide-react-native'
import BrandLogo from '../BrandLogo'
import { colors, spacing, borderRadius, textStyles, fontFamily } from '../../theme'

export type ReceiptRow = { label: string; value: string }

type Props = {
  /** Hero subtitle, e.g. "Sent to Samuel Odiba" / "Received from Chase". */
  title: string
  /** Signed, currency-formatted hero amount, e.g. "-$100.00" / "+$99.95". */
  amountText: string
  isCredit: boolean
  statusLabel: string
  outcome: 'success' | 'failed'
  dateText: string
  rows: ReceiptRow[]
  transactionId: string
  /** Fixed render width so the captured image is deterministic across devices. */
  width?: number
}

/**
 * Fintech-style shareable receipt (Cash App / Revolut / Wise pattern): a portrait card
 * — not an A4 page — with brand header, status glyph, hero amount, and the same canonical
 * detail rows shown in-app / on the business PDF. Previewed in the receipt sheet and
 * captured to a PNG. Footer matches the business PDF (support contact, no "Powered by").
 */
export const TransactionReceiptCard = forwardRef<View, Props>(function TransactionReceiptCard(
  { title, amountText, isCredit, statusLabel, outcome, dateText, rows, transactionId, width = 380 },
  ref,
) {
  const succeeded = outcome === 'success'
  const glyphColor = succeeded ? colors.success.main : colors.error.main
  const glyphBg = succeeded ? colors.success.background : colors.error.background
  const amountColor = isCredit ? colors.primary.main : colors.text.primary

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width }]}>
      <View style={styles.header}>
        <BrandLogo size="sm" />
        <Text style={styles.headerLabel}>Receipt</Text>
      </View>

      <View style={styles.heroBlock}>
        <View style={[styles.glyph, { backgroundColor: glyphBg }]}>
          {succeeded ? (
            <Check size={26} color={glyphColor} strokeWidth={3} />
          ) : (
            <X size={26} color={glyphColor} strokeWidth={3} />
          )}
        </View>
        <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1} adjustsFontSizeToFit>
          {amountText}
        </Text>
        {title ? (
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        <View style={[styles.statusPill, { backgroundColor: glyphBg }]}>
          <Text style={[styles.statusText, { color: glyphColor }]}>{statusLabel}</Text>
        </View>
        <Text style={styles.date}>{dateText}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={`${row.label}:${row.value}`} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.dashedDivider} />

      <View style={styles.idBlock}>
        <Text style={styles.idLabel}>Transaction ID</Text>
        <Text style={styles.idValue}>{transactionId}</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>For complaints regarding this transaction,</Text>
        <Text style={styles.footerText}>
          please contact our support:{' '}
          <Text style={styles.footerEmail}>support@easner.com</Text>
        </Text>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
    paddingBottom: spacing[5],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[5],
  },
  headerLabel: {
    ...textStyles.labelSmall,
    color: colors.text.tertiary,
  },
  heroBlock: {
    alignItems: 'center',
    marginBottom: spacing[5],
  },
  glyph: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  amount: {
    ...textStyles.displaySmall,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
  },
  title: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  statusPill: {
    marginTop: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  statusText: {
    ...textStyles.labelMedium,
  },
  date: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
    marginTop: spacing[2],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.default,
    marginBottom: spacing[4],
  },
  rows: {
    gap: spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  rowLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    flexShrink: 0,
  },
  rowValue: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    flex: 1,
    textAlign: 'right',
  },
  dashedDivider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border.default,
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  idBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  idLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  idValue: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.text.primary,
    flex: 1,
    textAlign: 'right',
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing[6],
  },
  footerText: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  footerEmail: {
    ...textStyles.bodySmall,
    color: colors.text.link,
  },
})
