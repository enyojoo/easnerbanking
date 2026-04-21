import React from 'react'
import { View, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'
import { borderRadius, spacing, textStyles, useThemeColors } from '../../theme'
import { ripple } from '../../lib/androidRipple'

type SecondaryOutlineButtonProps = {
  title: string
  onPress: () => void
  style?: StyleProp<ViewStyle>
}

export default function SecondaryOutlineButton({
  title,
  onPress,
  style,
}: SecondaryOutlineButtonProps) {
  const palette = useThemeColors()
  return (
    <View style={[styles.rowSlot, style]}>
      <Pressable
        onPress={onPress}
        android_ripple={ripple.neutral}
        style={({ pressed }) => [
          styles.pressable,
          {
            backgroundColor: palette.background.primary,
            borderColor: palette.frame.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.title, { color: palette.text.primary }]}>{title}</Text>
      </Pressable>
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
  pressable: {
    flex: 1,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  title: {
    ...textStyles.titleLarge,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.9,
  },
})

