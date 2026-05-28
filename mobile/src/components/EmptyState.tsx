import React from 'react'
import { View, Text, StyleSheet, ViewStyle, Pressable, Platform } from 'react-native'
import { FileText } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { colors, textStyles, spacing, borderRadius, fontFamily } from '../theme'
import { ripple } from '../lib/androidRipple'
import { haptics } from '../lib/haptics'
import EaseEnter from './EaseEnter'

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
    <EaseEnter translateY={8} style={style}>
      <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Icon size={48} color={colors.neutral[400]} strokeWidth={1.5} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action ? (
        <Pressable
          android_ripple={ripple.primaryTint}
          style={({ pressed }) => [
            styles.actionButton,
            Platform.OS === 'android' && styles.actionButtonClip,
            pressed && Platform.OS === 'ios' && styles.actionPressedIOS,
          ]}
          onPress={() => {
            haptics.tap()
            action.onPress()
          }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
      </View>
    </EaseEnter>
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
  actionButton: {
    marginTop: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.main + '12',
  },
  actionButtonClip: {
    overflow: 'hidden',
  },
  actionPressedIOS: {
    opacity: 0.85,
  },
  actionText: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
})
