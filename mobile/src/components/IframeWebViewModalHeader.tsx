import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, type TextStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, textStyles, spacing } from '../theme'

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
  const left =
    children ??
    (title ? (
      <Text style={styles.titleText} numberOfLines={2}>
        {title}
      </Text>
    ) : null)

  return (
    <View style={styles.header}>
      <View style={styles.titleBlock}>{left}</View>
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.7}
        style={styles.closeHit}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={22} color={colors.text.primary} />
      </TouchableOpacity>
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
    borderBottomColor: colors.border.light,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing[2],
  },
  closeHit: {
    padding: spacing[1],
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontWeight: '600',
    textAlign: 'left',
  },
})

/** Default title style for custom `children` (e.g. first line before a tier pill). */
export const iframeModalTitleTextStyle: TextStyle = styles.titleText
