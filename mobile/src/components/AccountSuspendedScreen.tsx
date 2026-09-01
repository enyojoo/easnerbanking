import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { accountRestrictionLockedCopy } from '@easner/shared'
import { colors, spacing, textStyles } from '../theme'
import { ripple } from '../lib/androidRipple'

export function AccountSuspendedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Account suspended</Text>
      <Text style={styles.body}>{accountRestrictionLockedCopy()}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onLogout}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        android_ripple={ripple(colors.semantic.border)}
      >
        <Text style={styles.buttonLabel}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.semantic.background,
  },
  title: {
    ...textStyles.title2,
    color: colors.semantic.foreground,
    textAlign: 'center',
  },
  body: {
    ...textStyles.body,
    color: colors.semantic.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  button: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    ...textStyles.bodyMedium,
    color: colors.semantic.foreground,
  },
})
