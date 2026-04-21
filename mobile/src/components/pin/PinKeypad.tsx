import React from 'react'
import { View, Text, Pressable, Platform, StyleSheet, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import {
  borderRadius,
  spacing,
  computeKeypadCellSize,
  layout,
  getContentWidth,
  useThemeColors,
  fontFamily,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'

type Props = {
  onDigit: (d: string) => void
  onBackspace: () => void
  disabled?: boolean
  filledCount: number
  backspaceActiveColor?: string
  maxButtonSize?: number
}

/** 3×4 numeric keypad + backspace (matches unlock / app-lock spec). */
export function PinKeypad({
  onDigit,
  onBackspace,
  disabled,
  filledCount,
  backspaceActiveColor,
  maxButtonSize = 92,
}: Props) {
  const palette = useThemeColors()
  const { width } = useWindowDimensions()
  const contentWidth = getContentWidth(width, layout.screenHorizontal)
  const keypadSizing = computeKeypadCellSize(contentWidth, {
    gap: spacing[4],
    minSize: 68,
    maxSize: maxButtonSize,
  })

  return (
    <View style={styles.keypadContainer}>
      <View
        style={[
          styles.keypadGrid,
          { width: keypadSizing.rowWidth, gap: keypadSizing.gap, rowGap: keypadSizing.gap },
        ]}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <Pressable
            key={num}
            style={({ pressed }) => [
              styles.keypadButton,
              {
                width: keypadSizing.buttonWidth,
                height: keypadSizing.buttonWidth,
                borderRadius: Math.max(borderRadius.xl, Math.floor(keypadSizing.buttonWidth * 0.28)),
                backgroundColor: palette.semantic.muted,
              },
              pressed && Platform.OS === 'ios' && styles.keypadPressedIOS,
            ]}
            onPress={() => {
              onDigit(String(num))
            }}
            onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            disabled={disabled}
            android_ripple={ripple.neutral}
          >
            <Text style={[styles.keypadButtonText, { color: palette.text.primary }]}>{num}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.keypadBottomRow, { width: keypadSizing.rowWidth }]}>
        <View style={[styles.keypadButtonSpacer, { width: keypadSizing.buttonWidth }]} />
        <Pressable
          style={({ pressed }) => [
            styles.keypadButton,
            {
              width: keypadSizing.buttonWidth,
              height: keypadSizing.buttonWidth,
              borderRadius: Math.max(borderRadius.xl, Math.floor(keypadSizing.buttonWidth * 0.28)),
              backgroundColor: palette.semantic.muted,
            },
            pressed && Platform.OS === 'ios' && styles.keypadPressedIOS,
          ]}
          onPress={() => onDigit('0')}
          onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          disabled={disabled}
          android_ripple={ripple.neutral}
        >
          <Text style={[styles.keypadButtonText, { color: palette.text.primary }]}>0</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.keypadButton,
            {
              width: keypadSizing.buttonWidth,
              height: keypadSizing.buttonWidth,
              borderRadius: Math.max(borderRadius.xl, Math.floor(keypadSizing.buttonWidth * 0.28)),
              backgroundColor: palette.semantic.muted,
            },
            pressed && Platform.OS === 'ios' && styles.keypadPressedIOS,
          ]}
          onPress={onBackspace}
          onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          disabled={disabled || filledCount === 0}
          android_ripple={ripple.neutral}
        >
          <Ionicons
            name="backspace"
            size={24}
            color={
              filledCount === 0 ? palette.text.secondary : backspaceActiveColor || palette.text.primary
            }
          />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  keypadContainer: {
    width: '100%',
    alignItems: 'center',
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing[4],
    marginBottom: spacing[4],
  },
  keypadButton: {
    width: 72,
    height: 72,
    borderRadius: borderRadius['2xl'],
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  keypadPressedIOS: {
    opacity: 0.6,
  },
  keypadButtonText: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  keypadBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  keypadButtonSpacer: {
    width: 72,
  },
})
