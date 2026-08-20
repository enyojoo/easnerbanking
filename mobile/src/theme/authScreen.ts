import { Platform, StyleSheet } from 'react-native'
import { colors, textStyles, borderRadius, spacing } from './index'
import { standardInputMetrics } from './textInputStyles'

/**
 * Shared typography and field styles for auth flows (AuthScreen, LoginScreen).
 * Uses design tokens only – no one-off font sizes.
 *
 * Form controls use pill radius for mobile auth parity with `TextField` / premium fields.
 */
export const AUTH_FIELD_MIN_HEIGHT = 52

export const authScreenStyles = StyleSheet.create({
/** Hero title for sign-in / sign-up entry only (`LoginScreen`, `AuthScreen` form + login). */
  screenTitle: {
    ...textStyles.displaySmall,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing[5],
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  /** Secondary auth steps (OTP, forgot password, reset, verify email). */
  screenTitleCompact: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing[4],
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  fieldLabel: {
    ...textStyles.labelLarge,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.textInputSingleLine,
    color: colors.text.primary,
    backgroundColor: colors.semantic.background,
    textAlignVertical: 'center',
    ...standardInputMetrics,
  },
  passwordOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.background,
    minHeight: AUTH_FIELD_MIN_HEIGHT,
  },
  /** Inner field for password rows (no border – outer `passwordOuter` draws the frame). */
  passwordInner: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.textInputSingleLine,
    color: colors.text.primary,
    borderWidth: 0,
    backgroundColor: 'transparent',
    textAlignVertical: 'center',
    ...standardInputMetrics,
  },
  termsIntro: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  termsLink: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontWeight: '600',
  },
  rememberMeText: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: AUTH_FIELD_MIN_HEIGHT,
    marginBottom: spacing[4],
  },
  primaryButtonText: {
    ...textStyles.titleMedium,
    color: colors.text.inverse,
    fontWeight: '600',
  },
  forgotPasswordText: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontWeight: '500',
  },
  footerMuted: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  footerLink: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontWeight: '600',
  },
  linkText: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontWeight: '500',
  },
})
