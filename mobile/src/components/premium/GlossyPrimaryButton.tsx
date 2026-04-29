import React, { useRef } from 'react'
import { View, Pressable, StyleSheet, Text, Animated, Platform, type ViewStyle, type StyleProp } from 'react-native'
import * as Haptics from 'expo-haptics'
import { borderRadius, spacing, textStyles, useThemeColors } from '../../theme'
import { ripple } from '../../lib/androidRipple'

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
  const scale = useRef(new Animated.Value(1)).current

  return (
    <View style={[styles.rowSlot, style]}>
      <Animated.View style={[styles.scaleWrap, { transform: [{ scale }] }]}>
        <Pressable
          android_ripple={ripple.primaryTint}
          disabled={disabled}
          onPressIn={() => {
            Animated.spring(scale, {
              toValue: 0.97,
              useNativeDriver: true,
              speed: 50,
              bounciness: 4,
            }).start()
          }}
          onPressOut={() => {
            Animated.spring(scale, {
              toValue: 1,
              useNativeDriver: true,
              speed: 50,
              bounciness: 4,
            }).start()
          }}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            onPress()
          }}
          style={({ pressed }) => [
            styles.touchable,
            { backgroundColor: palette.primary.main },
            borderColor ? { borderColor, borderWidth: 1 } : null,
            pressed && Platform.OS === 'ios' && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <Text style={[styles.title, { color: '#FFFFFF' }]}>{title}</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  /** Plain View owns flex + height from parent so widths match the outline button. */
  rowSlot: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 52,
  },
  scaleWrap: {
    flex: 1,
  },
  touchable: {
    flex: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...textStyles.titleMedium,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: -0.1,
  },
  pressed: { opacity: 0.92 },
  disabled: { opacity: 0.5 },
})

