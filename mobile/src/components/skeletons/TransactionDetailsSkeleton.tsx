import React from 'react'
import { View, StyleSheet } from 'react-native'
import ShimmerLoader, { ShimmerText } from '../premium/ShimmerLoader'
import { SectionCard } from '../ui/SectionCard'
import { ListRowSkeleton } from './ListRowSkeleton'
import { colors, spacing, borderRadius } from '../../theme'

/**
 * Scroll content for transaction detail loading – matches hero + summary SectionCards.
 * Parent supplies ScrollView + padding (see TransactionDetailsScreen).
 */
export function TransactionDetailsBodySkeleton() {
  return (
    <>
      <SectionCard style={styles.heroCard}>
        <ShimmerLoader width={64} height={64} borderRadius={32} style={styles.heroIcon} />
        <ShimmerText width="70%" height={16} style={styles.heroTitleShim} />
        <ShimmerLoader width={160} height={40} borderRadius={borderRadius.lg} style={styles.heroAmountShim} />
        <ShimmerLoader width={100} height={28} borderRadius={borderRadius.full} />
      </SectionCard>

      <SectionCard style={styles.summaryCard} flush>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[
              styles.summaryRow,
              i < 5 && styles.summaryRowDivider,
            ]}
          >
            <ShimmerText width="38%" height={14} />
            <ShimmerText width="52%" height={14} />
          </View>
        ))}
      </SectionCard>
    </>
  )
}

/** Compact row shimmer for “card transactions” list (no leading icon). */
export function PlainTwoColumnRowSkeleton({ showDivider }: { showDivider?: boolean }) {
  return <ListRowSkeleton variant="plain" showDivider={showDivider} />
}

const styles = StyleSheet.create({
  heroCard: {
    alignItems: 'center',
    paddingVertical: spacing[6],
    marginBottom: spacing[3],
  },
  heroIcon: {
    marginBottom: spacing[3],
  },
  heroTitleShim: {
    marginBottom: spacing[2],
  },
  heroAmountShim: {
    marginBottom: spacing[3],
  },
  summaryCard: {
    marginBottom: spacing[3],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  summaryRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
})
