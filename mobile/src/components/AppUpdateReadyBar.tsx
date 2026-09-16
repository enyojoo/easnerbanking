import React from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PressableScale } from 'pressto'
import { borderRadius, spacing, textStyles, useThemeColors, zIndex } from '../theme'
import { haptics } from '../lib/haptics'

type AppUpdateReadyBarProps = {
  onRestart: () => void
}

export function AppUpdateReadyBar({ onRestart }: AppUpdateReadyBarProps) {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: palette.semantic.card,
            borderColor: palette.semantic.border,
          },
        ]}
      >
        <Text style={[styles.message, { color: palette.text.primary }]} accessibilityRole="text">
          A new version is ready
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Restart to update"
          onPress={() => {
            haptics.medium()
            onRestart()
          }}
          style={[styles.cta, { backgroundColor: palette.primary.main }]}
        >
          <Text style={styles.ctaLabel}>Restart</Text>
        </PressableScale>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: zIndex.fixed,
    paddingHorizontal: spacing[4],
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius['2xl'],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  message: {
    ...textStyles.bodyMedium,
    flex: 1,
    fontWeight: '600',
  },
  cta: {
    minHeight: 40,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    ...textStyles.titleMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
})
