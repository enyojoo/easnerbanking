import React, { useRef } from 'react'
import { View, Pressable, StyleSheet, Text, Animated, Platform, type ViewStyle, type StyleProp } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { borderRadius, shadows, spacing, textStyles, useThemeColors } from '../../theme'
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
            pressed && Platform.OS === 'ios' && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <LinearGradient
            colors={[palette.primary.dark, palette.primary.main]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gradient, borderColor ? { borderColor } : null]}
          >
            <Text style={[styles.title, { color: palette.neutral.white }]}>{title}</Text>
          </LinearGradient>
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
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    ...shadows.sm,
  },
  title: {
    ...textStyles.titleLarge,
    fontWeight: '700',
  },
  pressed: { opacity: 0.94 },
  disabled: { opacity: 0.5 },
})

