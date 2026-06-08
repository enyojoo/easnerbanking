import React, { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { spacing, textStyles } from '../../theme'
import { useThemeColors } from '../../contexts/ThemePaletteContext'

type DesktopPageHeaderProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function DesktopPageHeader({ title, subtitle, actions }: DesktopPageHeaderProps) {
  const { mode } = useResponsiveLayout()
  const palette = useThemeColors()

  if (mode !== 'desktop') return null

  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Text style={[textStyles.headlineSmall, { color: palette.text.primary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[textStyles.bodySmall, { color: palette.text.secondary, marginTop: spacing[1] }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing[5],
    gap: spacing[4],
  },
  titles: {
    flex: 1,
  },
  actions: {
    flexShrink: 0,
  },
})
