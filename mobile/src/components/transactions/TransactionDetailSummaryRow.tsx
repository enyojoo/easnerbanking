import React from 'react'
import { View, Text, StyleSheet, type ReactNode } from 'react-native'
import { colors, spacing, textStyles, fontFamily } from '../../theme'

type Props = {
  label: string
  value?: string
  valueBold?: boolean
  valueMono?: boolean
  /** Custom right column (copy control, recipient block, etc.). */
  children?: ReactNode
}

/** Bordered label/value row — shared by deposit and payout transaction detail cards. */
export function TransactionDetailSummaryRow({
  label,
  value,
  valueBold,
  valueMono,
  children,
}: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {children ?? (
        <Text
          style={[
            styles.value,
            valueBold && styles.valueBold,
            valueMono && styles.valueMono,
          ]}
          numberOfLines={valueBold ? undefined : 3}
        >
          {value}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  label: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  value: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing[2],
  },
  valueBold: {
    fontWeight: '700',
  },
  valueMono: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    fontWeight: '500',
  },
})
