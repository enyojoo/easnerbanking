import React from 'react'
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'

/** Matches business `login` / `signup` pages: horizontal rule + centered “Or”. Form/outline: 8px radius, semantic border. */
export function OrDivider() {
  return (
    <View style={styles.orWrap}>
      <View style={styles.orLine} />
      <Text style={styles.orLabel}>Or</Text>
      <View style={styles.orLine} />
    </View>
  )
}

type GoogleButtonProps = {
  label: 'Sign in with Google' | 'Sign up with Google'
  onPress: () => void
  disabled?: boolean
}

/** Outline full-width button like shadcn `Button variant="outline"`. */
export function GoogleOutlineButton({ label, onPress, disabled }: GoogleButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.googleBtn,
        disabled && styles.googleBtnDisabled,
        Platform.OS === 'android' && styles.googleBtnClip,
        pressed && Platform.OS === 'ios' && !disabled && styles.googleBtnPressedIOS,
      ]}
      onPress={async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      disabled={disabled}
      android_ripple={ripple.neutral}
    >
      <Ionicons name="logo-google" size={20} color={colors.text.primary} />
      <Text style={styles.googleBtnText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  orWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing[4],
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.semantic.border,
  },
  orLabel: {
    ...textStyles.labelSmall,
    color: colors.semantic.mutedForeground,
    textTransform: 'uppercase',
    paddingHorizontal: spacing[3],
    letterSpacing: 0.5,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.semantic.border,
    backgroundColor: colors.semantic.background,
    ...Platform.select({
      android: {
        borderColor: colors.semantic.border,
      },
    }),
  },
  googleBtnClip: {
    overflow: 'hidden',
  },
  googleBtnPressedIOS: {
    opacity: 0.7,
  },
  googleBtnDisabled: {
    opacity: 0.5,
  },
  googleBtnText: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontWeight: '500',
  },
})
