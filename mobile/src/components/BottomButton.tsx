import React from 'react'
import { View, Pressable, Text, StyleSheet, Platform } from 'react-native'
import { ripple } from '../lib/androidRipple'
import { haptics } from '../lib/haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, borderRadius, spacing, textStyles, fontSize, layout } from '../theme'

interface BottomButtonProps {
  title: string
  onPress: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

export default function BottomButton({
  title,
  onPress,
  disabled = false,
  variant = 'primary',
}: BottomButtonProps) {
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom + spacing[2], spacing[4]),
          paddingHorizontal: spacing[5],
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.button,
          variant === 'primary' ? styles.primaryButton : styles.secondaryButton,
          disabled && styles.disabledButton,
          Platform.OS === 'android' && styles.buttonClip,
          pressed && Platform.OS === 'ios' && !disabled && styles.buttonPressedIOS,
        ]}
        onPressIn={() => haptics[variant === 'primary' ? 'medium' : 'tap']()}
        onPress={onPress}
        disabled={disabled}
        android_ripple={ripple.primaryTint}
      >
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText,
            disabled && styles.disabledButtonText,
          ]}
        >
          {title}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.semantic.background,
    borderTopWidth: 1,
    borderTopColor: colors.semantic.border,
    paddingTop: spacing[4],
  },
  button: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.primaryButtonMinHeight,
  },
  buttonClip: {
    overflow: 'hidden',
  },
  buttonPressedIOS: {
    opacity: 0.92,
  },
  primaryButton: {
    backgroundColor: colors.primary.main,
  },
  secondaryButton: {
    backgroundColor: colors.semantic.muted,
  },
  disabledButton: {
    backgroundColor: colors.neutral[400],
  },
  buttonText: {
    ...textStyles.titleMedium,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: colors.text.inverse,
  },
  secondaryButtonText: {
    color: colors.semantic.foreground,
  },
  disabledButtonText: {
    color: colors.text.inverse,
  },
})
