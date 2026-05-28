import React from 'react'
import { View, StyleSheet, Text, Platform, type ViewStyle, type StyleProp } from 'react-native'
import { PressableScale } from 'pressto'
import { borderRadius, spacing, textStyles, useThemeColors } from '../../theme'
import { haptics } from '../../lib/haptics'

type GlossyPrimaryButtonProps = {
  title: string
  onPress: () => void
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  borderColor?: string
}

export default function GlossyPrimaryButton({
  title,
  onPress,
  style,
  disabled = false,
  borderColor,
}: GlossyPrimaryButtonProps) {
  const palette = useThemeColors()

  return (
    <View style={[styles.rowSlot, style]}>
      <PressableScale
        disabled={disabled}
        onPress={() => {
          haptics.tap()
          onPress()
        }}
        style={[
          styles.touchable,
          { backgroundColor: palette.primary.main },
          borderColor ? { borderColor, borderWidth: 1 } : null,
          disabled && styles.disabled,
          Platform.OS === 'android' && styles.androidClip,
        ]}
      >
        <Text style={[styles.title, { color: '#FFFFFF' }]}>{title}</Text>
      </PressableScale>
    </View>
  )
}

const styles = StyleSheet.create({
  rowSlot: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 52,
  },
  touchable: {
    flex: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidClip: { overflow: 'hidden' },
  title: {
    ...textStyles.titleMedium,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: -0.1,
  },
  disabled: { opacity: 0.5 },
})
