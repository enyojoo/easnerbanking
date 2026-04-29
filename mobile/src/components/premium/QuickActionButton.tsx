/**
 * QuickActionButton - Premium floating action button for dashboard
 * 
 * Features:
 * - Gradient icon container
 * - Haptic feedback
 * - Scale animation on press
 * - Shadow elevation
 */

import React, { useRef, useCallback } from 'react'
import {
  StyleSheet,
  Pressable,
  Platform,
  Text,
  View,
  ViewStyle,
  Animated,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import type { LucideIcon } from 'lucide-react-native'
import { colors, textStyles, borderRadius, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'

interface QuickActionButtonProps {
  icon: LucideIcon
  label: string
  onPress: () => void
  /** Optional override for the icon foreground color — defaults to brand primary. */
  iconColor?: string
  /** Optional override for the icon-circle background — defaults to ~10% primary tint. */
  iconBackground?: string
  style?: ViewStyle
}

export default function QuickActionButton({
  icon: Icon,
  label,
  onPress,
  iconColor = colors.primary.main,
  iconBackground = 'rgba(0, 122, 204, 0.10)',
  style,
}: QuickActionButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start()
  }, [scaleAnim])

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start()
  }, [scaleAnim])

  const handlePress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onPress()
  }, [onPress])

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={ripple.primaryTint}
        style={({ pressed }) => [
          styles.touchable,
          Platform.OS === 'android' && styles.touchableClip,
          pressed && Platform.OS === 'ios' && styles.touchablePressedIOS,
        ]}
      >
        <View style={[styles.iconContainer, { backgroundColor: iconBackground }]}>
          <Icon size={22} color={iconColor} strokeWidth={2.25} />
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  touchable: {
    alignItems: 'center',
  },
  touchableClip: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  touchablePressedIOS: {
    opacity: 0.9,
  },
  /** Tinted-blue circular icon well — 48px circle with primary @ ~10% alpha fill. */
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: {
    ...textStyles.labelMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    textAlign: 'center',
  },
})
