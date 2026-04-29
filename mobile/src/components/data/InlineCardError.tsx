import React from 'react'
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native'
import { CircleAlert, RefreshCw } from 'lucide-react-native'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { fontFamily } from '../../theme'

/**
 * Inline error banner for a data-backed card/screen section.
 *
 * Rule: NEVER replace a money-facing screen with a full-screen error while
 * we have any cached state. Render this quiet banner and let the cached
 * values stay readable. Full-screen errors are reserved for truly empty
 * first renders.
 */

type Props = {
  title?: string
  message?: string | null
  onRetry?: () => void
  isRetrying?: boolean
  style?: ViewStyle
}

export function InlineCardError({
  title = "Couldn't refresh",
  message,
  onRetry,
  isRetrying,
  style,
}: Props) {
  const colors = useThemeColors()
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.row,
        {
          borderColor: colors.warning.main,
          backgroundColor: colors.warning.background,
        },
        style,
      ]}
    >
      <CircleAlert size={16} color={colors.warning.main} strokeWidth={2} style={styles.icon} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.warning.main }]}>{title}</Text>
        {message ? (
          <Text style={[styles.message, { color: colors.warning.main }]} numberOfLines={2}>
            {message}
          </Text>
        ) : null}
      </View>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          disabled={isRetrying}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            { opacity: isRetrying ? 0.5 : pressed ? 0.7 : 1 },
          ]}
        >
          <RefreshCw size={14} color={colors.warning.main} strokeWidth={2} style={[isRetrying && styles.spin]} />
          <Text style={[styles.actionLabel, { color: colors.warning.main }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  icon: { marginTop: 2 },
  body: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.semibold, fontSize: 13 },
  message: { fontFamily: fontFamily.regular, fontSize: 12, opacity: 0.85 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  actionLabel: { fontFamily: fontFamily.medium, fontSize: 12 },
  spin: { opacity: 0.8 },
})
