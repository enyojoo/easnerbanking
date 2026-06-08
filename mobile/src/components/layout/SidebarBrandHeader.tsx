import React, { useMemo } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { HEADER_HEIGHT, shadows, spacing, textStyles } from '../../theme'

const EASNER_ICON = require('../../../assets/icons/easner-icon.png')

/** Consumer sidebar header — mirrors business nav logo tile + title row. */
export function SidebarBrandHeader() {
  const palette = useThemeColors()
  const styles = useMemo(() => createStyles(palette), [palette])

  return (
    <View style={styles.header}>
      <View style={styles.logoTile}>
        <Image source={EASNER_ICON} style={styles.logoImage} resizeMode="cover" accessibilityLabel="Easner" />
      </View>
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          Easner
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Personal
        </Text>
      </View>
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
      gap: spacing[3],
      paddingHorizontal: spacing[5],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border.default,
    },
    logoTile: {
      width: 36,
      height: 36,
      borderRadius: spacing[3],
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.semantic.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border.default,
      ...shadows.sm,
    },
    logoImage: {
      width: 36,
      height: 36,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      ...textStyles.titleSmall,
      color: palette.text.primary,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    subtitle: {
      ...textStyles.labelSmall,
      color: palette.text.secondary,
    },
  })
}
