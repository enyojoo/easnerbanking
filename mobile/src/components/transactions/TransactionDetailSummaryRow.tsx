import React from 'react'
import { View, Text, StyleSheet, Pressable, type ReactNode, type TextStyle } from 'react-native'
import { Check, Copy } from 'lucide-react-native'
import { colors, spacing, textStyles, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'

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
    <View style={transactionDetailRowStyles.row}>
      <Text style={transactionDetailRowStyles.label}>{label}</Text>
      {children ?? (
        <Text
          style={[
            transactionDetailRowStyles.value,
            valueBold && transactionDetailRowStyles.valueBold,
            valueMono && transactionDetailRowStyles.valueMono,
          ]}
          numberOfLines={valueBold ? undefined : 3}
        >
          {value}
        </Text>
      )}
    </View>
  )
}

type CopyableValueProps = {
  value: string
  copied?: boolean
  onPress: () => void
  mono?: boolean
  valueStyle?: TextStyle
}

/** Right-column copy control used for Transaction ID and other copyable detail values. */
export function TransactionDetailCopyableValue({
  value,
  copied = false,
  onPress,
  mono = false,
  valueStyle,
}: CopyableValueProps) {
  return (
    <Pressable
      android_ripple={ripple.neutral}
      style={transactionDetailRowStyles.copyableValueRow}
      onPress={onPress}
    >
      <Text
        style={[
          transactionDetailRowStyles.value,
          mono && transactionDetailRowStyles.valueMono,
          valueStyle,
        ]}
        selectable
        numberOfLines={1}
      >
        {value}
      </Text>
      <View style={[transactionDetailRowStyles.copyIcon, copied && transactionDetailRowStyles.copyIconSuccess]}>
        {copied ? (
          <Check size={14} color={colors.success.main} strokeWidth={2.5} />
        ) : (
          <Copy size={14} color={colors.primary.main} strokeWidth={2} />
        )}
      </View>
    </Pressable>
  )
}

/** Shared row chrome — matches SendConfirm / YcFundBalanceReview review rows. */
export const transactionDetailRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
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
    ...textStyles.body,
    color: colors.text.primary,
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing[2],
  },
  valueBold: {
    fontFamily: fontFamily.semibold,
  },
  valueMono: {
    fontFamily: fontFamily.mono,
    fontWeight: '500',
  },
  copyableValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  copyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyIconSuccess: {
    backgroundColor: colors.success.background,
  },
})
