import React from 'react'
import { View, StyleSheet } from 'react-native'
import ShimmerLoader, { ShimmerText } from '../premium/ShimmerLoader'
import { colors, spacing, borderRadius, shadows } from '../../theme'

const hairline = StyleSheet.hairlineWidth

export type ListRowSkeletonVariant = 'transaction' | 'recipient' | 'plain'

type Props = {
  variant?: ListRowSkeletonVariant
  /** When true, show a bottom hairline like list rows inside a SectionCard / tray. */
  showDivider?: boolean
  style?: object
}

/**
 * Row placeholder aligned with neobank list rows (Dashboard recent activity, Transactions,
 * Recipients tray, Select recipient). Uses the same rhythm as real rows: leading tile,
 * two text lines, trailing column (amount / chevron).
 */
export function ListRowSkeleton({ variant = 'transaction', showDivider = true, style }: Props) {
  const leadingSize = variant === 'recipient' ? 48 : variant === 'plain' ? 0 : 44
  const paddingV = variant === 'recipient' ? spacing[5] : spacing[4]
  const minH = variant === 'recipient' ? 80 : 64

  return (
    <View
      style={[
        styles.row,
        { paddingVertical: paddingV, minHeight: minH },
        showDivider && styles.rowDivider,
        style,
      ]}
    >
      {leadingSize > 0 ? (
        <ShimmerLoader
          width={leadingSize}
          height={leadingSize}
          borderRadius={leadingSize / 2}
          style={styles.leading}
        />
      ) : null}

      <View style={styles.mid}>
        <ShimmerText width="72%" height={14} />
        <ShimmerText width="48%" height={12} style={styles.metaLine} />
      </View>

      <View style={styles.trail}>
        {variant === 'recipient' ? (
          <ShimmerLoader width={20} height={20} borderRadius={borderRadius.sm} />
        ) : (
          <>
            <ShimmerLoader width={72} height={18} borderRadius={borderRadius.sm} />
            {variant === 'transaction' ? (
              <ShimmerLoader
                width={52}
                height={11}
                borderRadius={borderRadius.sm}
                style={styles.statusShim}
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  )
}

/** One white card with stacked row skeletons — matches Transactions date `groupCard` + dividers. */
export function GroupedListCardSkeleton({
  rowCount = 5,
  variant = 'transaction',
}: {
  rowCount?: number
  variant?: ListRowSkeletonVariant
}) {
  return (
    <View style={styles.groupCard}>
      {Array.from({ length: rowCount }, (_, i) => (
        <ListRowSkeleton
          key={i}
          variant={variant}
          showDivider={i < rowCount - 1}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    backgroundColor: colors.semantic.card,
  },
  rowDivider: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.border.light,
  },
  leading: {
    marginRight: spacing[3],
    flexShrink: 0,
  },
  mid: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  metaLine: {
    marginTop: spacing[1],
  },
  trail: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing[2],
    minWidth: 72,
  },
  statusShim: {
    marginTop: spacing[1],
  },
  groupCard: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius['2xl'],
    overflow: 'hidden',
    marginBottom: spacing[1],
    ...shadows.xs,
  },
})
