import React, { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { BRAND } from '@easner/shared'
import { CachedImage } from '../CachedImage'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { HEADER_HEIGHT, spacing } from '../../theme'

/** Consumer sidebar header – logo only (matches office sidebar). */
export function SidebarBrandHeader() {
  const palette = useThemeColors()
  const styles = useMemo(() => createStyles(palette), [palette])

  return (
    <View style={styles.header}>
      <CachedImage
        uri={BRAND.logoConsumer}
        style={styles.logo}
        contentFit="contain"
        accessibilityLabel="Easner"
      />
    </View>
  )
}

function createStyles(palette: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    header: {
      height: HEADER_HEIGHT,
      minHeight: HEADER_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing[6],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border.default,
    },
    logo: {
      height: 32,
      width: 160,
      maxWidth: '100%',
    },
  })
}
