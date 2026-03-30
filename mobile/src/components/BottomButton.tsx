import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, borderRadius, spacing, textStyles, fontSize } from '../theme'

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
      <TouchableOpacity
        style={[
          styles.button,
          variant === 'primary' ? styles.primaryButton : styles.secondaryButton,
          disabled && styles.disabledButton,
        ]}
        onPress={onPress}
        disabled={disabled}
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
      </TouchableOpacity>
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
    minHeight: 52,
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
