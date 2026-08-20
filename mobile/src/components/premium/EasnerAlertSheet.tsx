import React from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native'
import PremiumModalSheet from './PremiumModalSheet'
import {
  borderRadius,
  spacing,
  textStyles,
  fontFamily,
  useThemeColors,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'

export type EasnerAlertSheetProps = {
  visible: boolean
  onDismiss: () => void
  title: string
  message: string
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  /** Ignored when `singleAction` is true. */
  onSecondary?: () => void
  /**
   * Destructive primary – oxblood fill + ivory label (delete account, etc.).
   * Omit for brand-blue primary (logout, disable MFA, generic confirms).
   */
  primaryDestructive?: boolean
  primaryLoading?: boolean
  /** OK-only – hides secondary / cancel (errors, success toasts). */
  singleAction?: boolean
}

/**
 * Bottom-sheet confirmation with frosted chrome (via {@link PremiumModalSheet}).
 */
export default function EasnerAlertSheet({
  visible,
  onDismiss,
  title,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel = 'Cancel',
  onSecondary = () => {},
  primaryDestructive,
  primaryLoading,
  singleAction,
}: EasnerAlertSheetProps) {
  const palette = useThemeColors()
  const primaryBg = primaryDestructive
    ? palette.semantic.destructive
    : palette.primary.main
  const primaryFg = primaryDestructive
    ? palette.semantic.destructiveForeground
    : '#FFFFFF'

  return (
    <PremiumModalSheet visible={visible} onRequestClose={onDismiss}>
      <Text style={[styles.title, { color: palette.text.primary }]}>{title}</Text>
      <Text style={[styles.message, { color: palette.text.secondary }]}>{message}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          android_ripple={
            primaryDestructive ? ripple.destructiveTint : ripple.primaryTint
          }
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: primaryBg,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
          onPressIn={() => haptics[primaryDestructive ? 'medium' : 'tap']()}
          onPress={onPrimary}
          disabled={primaryLoading}
        >
          {primaryLoading ? (
            <ActivityIndicator color={primaryFg} />
          ) : (
            <Text
              style={[
                styles.primaryBtnText,
                { color: primaryFg },
              ]}
            >
              {primaryLabel}
            </Text>
          )}
        </Pressable>
        {!singleAction ? (
          <Pressable
            accessibilityRole="button"
            android_ripple={ripple.neutral}
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                backgroundColor: palette.semantic.card,
                borderColor: palette.border.default,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            onPressIn={() => haptics.tap()}
            onPress={onSecondary}
            disabled={primaryLoading}
          >
            <Text style={[styles.secondaryBtnText, { color: palette.text.primary }]}>
              {secondaryLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </PremiumModalSheet>
  )
}

const styles = StyleSheet.create({
  title: {
    ...textStyles.headlineSmall,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  message: {
    ...textStyles.bodyMedium,
    textAlign: 'center',
    marginBottom: spacing[6],
    lineHeight: 22,
  },
  actions: {
    gap: spacing[3],
    width: '100%',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: spacing[4],
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    ...Platform.select({
      ios: { overflow: 'hidden' },
      android: {},
    }),
  },
  primaryBtnText: {
    ...textStyles.bodyLarge,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 15,
  },
  /** Matches {@link SecondaryOutlineButton} (dashboard Send, etc.) */
  secondaryBtn: {
    width: '100%',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[6],
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 52,
  },
  secondaryBtnText: {
    ...textStyles.bodyLarge,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 15,
  },
})
