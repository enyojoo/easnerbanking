import React from 'react'
import { View, Text, Pressable, Platform, StyleSheet, ViewStyle } from 'react-native'
import { CircleAlert, RefreshCw } from 'lucide-react-native'
import { colors, textStyles, spacing, borderRadius, fontFamily } from '../theme'
import { ripple } from '../lib/androidRipple'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
  style?: ViewStyle
}

export default function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try Again',
  style,
}: ErrorStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        <CircleAlert size={48} color={colors.error.main} strokeWidth={2} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            Platform.OS === 'android' && styles.retryButtonClip,
            pressed && Platform.OS === 'ios' && styles.retryPressedIOS,
          ]}
          onPress={onRetry}
          android_ripple={ripple.primaryTint}
        >
          <RefreshCw size={20} color={colors.primary.main} strokeWidth={2} />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </Pressable>
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
    backgroundColor: colors.error.background,
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
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary.main + '10',
    marginTop: spacing[2],
  },
  retryButtonClip: {
    overflow: 'hidden',
  },
  retryPressedIOS: {
    opacity: 0.7,
  },
  retryText: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
})






















