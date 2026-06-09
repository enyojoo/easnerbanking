import React from 'react'
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import * as AppleAuthentication from 'expo-apple-authentication'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'

/** Matches auth fields: pill radius + semantic border. */
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

type AppleButtonProps = {
  mode: 'login' | 'signup'
  onPress: () => void
  disabled?: boolean
}

/** Web Sign in with Apple — Apple JS popup + Supabase id token (not expo-apple-authentication). */
export function WebAppleSignInButton({ mode, onPress, disabled }: AppleButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.googleBtn,
        styles.appleWebBtn,
        disabled && styles.googleBtnDisabled,
        Platform.OS === 'android' && styles.googleBtnClip,
        pressed && Platform.OS === 'ios' && !disabled && styles.googleBtnPressedIOS,
      ]}
      onPress={async () => {
        if (disabled) return
        haptics.tap()
        onPress()
      }}
      disabled={disabled}
      android_ripple={ripple.neutral}
    >
      <FontAwesome name="apple" size={22} color={colors.text.primary} />
      <Text style={styles.googleBtnText}>
        {mode === 'login' ? 'Sign in with Apple' : 'Sign up with Apple'}
      </Text>
    </Pressable>
  )
}

/** Native Sign in with Apple button (iOS only; Apple HIG styling). */
export function AppleSignInButton({ mode, onPress, disabled }: AppleButtonProps) {
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={
        mode === 'login'
          ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
      }
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={26}
      style={[styles.appleBtn, disabled && styles.appleBtnDisabled]}
      onPress={async () => {
        if (disabled) return
        haptics.tap()
        onPress()
      }}
    />
  )
}

/** Outline full-width button (pill radius, parity with `TextField`). */
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
        haptics.tap()
        onPress()
      }}
      disabled={disabled}
      android_ripple={ripple.neutral}
    >
      <FontAwesome name="google" size={20} color={colors.text.primary} />
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
    minHeight: 52,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
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
  appleBtn: {
    width: '100%',
    height: 52,
  },
  appleBtnDisabled: {
    opacity: 0.5,
  },
  appleWebBtn: {
    backgroundColor: colors.semantic.background,
  },
})
