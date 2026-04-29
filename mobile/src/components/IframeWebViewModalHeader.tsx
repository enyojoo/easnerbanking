import React from 'react'
import { View, Text, Pressable, Platform, StyleSheet, type TextStyle } from 'react-native'
import { X } from 'lucide-react-native'
import { borderRadius, textStyles, spacing, useThemeColors } from '../theme'
import { ripple } from '../lib/androidRipple'

export type IframeWebViewModalHeaderProps = {
  onClose: () => void
  /** Left title when `children` is omitted */
  title?: string
  /** Custom left content (e.g. title + tier row). When set, `title` is ignored. */
  children?: React.ReactNode
}

/**
 * Standard chrome for hosted WebView / iframe modals: **title (left) | close X (right)**.
 * Use across `ExternalLinkModal`, verification flows, and any in-app browser sheet.
 */
export function IframeWebViewModalHeader({ onClose, title, children }: IframeWebViewModalHeaderProps) {
  const colors = useThemeColors()
  const left =
    children ??
    (title ? (
      <Text style={[styles.titleText, { color: colors.text.primary }]} numberOfLines={2}>
        {title}
      </Text>
    ) : null)

  return (
    <View style={[styles.header, { borderBottomColor: colors.border.light }]}>
      <View style={styles.titleBlock}>{left}</View>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [
          styles.closeHit,
          { backgroundColor: colors.glass.surface, borderColor: colors.glass.border },
          pressed && Platform.OS === 'ios' && styles.closeHitPressedIOS,
        ]}
        android_ripple={ripple.neutral}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <X size={20} color={colors.text.primary} strokeWidth={2} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    // Runtime theme value is applied inline in the component.
    borderBottomColor: 'transparent',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing[2],
  },
  closeHit: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeHitPressedIOS: {
    opacity: 0.7,
  },
  titleText: {
    ...textStyles.titleMedium,
    fontWeight: '700',
    textAlign: 'left',
  },
})

/** Default title style for custom `children` (e.g. first line before a tier pill). */
export const iframeModalTitleTextStyle: TextStyle = styles.titleText
