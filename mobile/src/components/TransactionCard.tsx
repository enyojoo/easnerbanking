import React from 'react'
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native'
import { ArrowDownLeft, ArrowUpRight, Monitor, Apple } from 'lucide-react-native'
import { colors, textStyles, spacing, fontFamily } from '../theme'
import { ripple } from '../lib/androidRipple'

interface TransactionCardProps {
  id: string
  type: 'send' | 'receive' | 'card_funding'
  name: string
  amount: string
  date: string
  currency?: string
  isReceived?: boolean
  onPress: () => void
  isLast?: boolean
}

export default function TransactionCard({
  type,
  name,
  amount,
  date,
  isReceived = false,
  onPress,
  isLast = false,
}: TransactionCardProps) {
  const getTransactionIcon = () => {
    const iconColor = colors.primary.main
    const iconSize = 16

    if (type === 'receive' || isReceived) {
      return <ArrowDownLeft size={iconSize} color={iconColor} strokeWidth={2.5} />
    } else if (type === 'card_funding') {
      return <Monitor size={iconSize} color={iconColor} strokeWidth={2.5} />
    } else {
      return <ArrowUpRight size={iconSize} color={iconColor} strokeWidth={2.5} />
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.transactionItem,
        isLast && styles.transactionItemLast,
        pressed && Platform.OS === 'ios' && styles.rowPressedIOS,
      ]}
      onPress={onPress}
      android_ripple={ripple.neutral}
      accessibilityLabel={`Transaction: ${name}, ${amount}`}
      accessibilityRole="button"
    >
      <View style={styles.transactionIconBox}>
        {getTransactionIcon()}
      </View>
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.transactionDate}>{date}</Text>
      </View>
      <Text
        style={[
          styles.transactionAmount,
          isReceived && styles.transactionAmountReceived,
        ]}
      >
        {amount}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  transactionItemLast: {
    borderBottomWidth: 0,
  },
  rowPressedIOS: {
    opacity: 0.7,
  },
  transactionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
    backgroundColor: colors.neutral.white,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    marginBottom: spacing[1],
  },
  transactionDate: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  transactionAmount: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  transactionAmountReceived: {
    color: colors.primary.main,
  },
})






















