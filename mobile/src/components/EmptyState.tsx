import React from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { FileText } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { colors, textStyles, spacing, borderRadius, fontFamily } from '../theme'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  message: string
  action?: {
    label: string
    onPress: () => void
  }
  style?: ViewStyle
}

export default function EmptyState({
  icon: Icon = FileText,
  title,
  message,
  action,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        <Icon size={48} color={colors.neutral[400]} strokeWidth={1.5} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action && (
        <View style={styles.actionContainer}>
          <Text style={styles.actionText} onPress={action.onPress}>
            {action.label}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[5],
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  title: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  message: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  actionContainer: {
    marginTop: spacing[2],
  },
  actionText: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
})
