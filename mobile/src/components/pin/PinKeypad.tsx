import React from 'react'
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native'
import { PressableScale } from 'pressto'
import { Delete } from 'lucide-react-native'
import {
  borderRadius,
  spacing,
  computeKeypadCellSize,
  layout,
  getContentWidth,
  useThemeColors,
  fontFamily,
} from '../../theme'
import { haptics } from '../../lib/haptics'

type Props = {
  onDigit: (d: string) => void
  onBackspace: () => void
  disabled?: boolean
  filledCount: number
  backspaceActiveColor?: string
  maxButtonSize?: number
  leadingAction?: {
    accessibilityLabel: string
    onPress: () => void
    icon: React.ReactNode
  } | null
}

/** 3×4 numeric keypad + backspace (matches unlock / app-lock spec). */
export function PinKeypad({
  onDigit,
  onBackspace,
  disabled,
  filledCount,
  backspaceActiveColor,
  maxButtonSize = 92,
  leadingAction,
}: Props) {
  const palette = useThemeColors()
  const { width } = useWindowDimensions()
  const contentWidth = getContentWidth(width, layout.screenHorizontal)
  const keypadSizing = computeKeypadCellSize(contentWidth, {
    gap: spacing[4],
    minSize: 68,
    maxSize: maxButtonSize,
  })

  const cellStyle = (pressed?: boolean) => [
    styles.keypadButton,
    {
      width: keypadSizing.buttonWidth,
      height: keypadSizing.buttonWidth,
      borderRadius: Math.max(borderRadius.xl, Math.floor(keypadSizing.buttonWidth * 0.28)),
      backgroundColor: palette.frame.background,
      borderColor: palette.frame.border,
    },
  ]

  const renderKey = (label: string, onPress: () => void, content: React.ReactNode, enabled = true) => (
    <PressableScale
      key={label}
      style={cellStyle()}
      onPress={onPress}
      onPressIn={() => haptics.tap()}
      enabled={enabled && !disabled}
    >
      {content}
    </PressableScale>
  )

  return (
    <View style={styles.keypadContainer}>
      <View
        style={[
          styles.keypadGrid,
          { width: keypadSizing.rowWidth, gap: keypadSizing.gap, rowGap: keypadSizing.gap },
        ]}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) =>
          renderKey(
            String(num),
            () => onDigit(String(num)),
            <Text style={[styles.keypadButtonText, { color: palette.text.primary }]}>{num}</Text>,
          ),
        )}
      </View>
      <View style={[styles.keypadBottomRow, { width: keypadSizing.rowWidth }]}>
        {leadingAction ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={leadingAction.accessibilityLabel}
            style={cellStyle()}
            onPress={leadingAction.onPress}
            onPressIn={() => haptics.tap()}
            enabled={!disabled}
          >
            {leadingAction.icon}
          </PressableScale>
        ) : (
          <View style={[styles.keypadButtonSpacer, { width: keypadSizing.buttonWidth }]} />
        )}
        {renderKey(
          '0',
          () => onDigit('0'),
          <Text style={[styles.keypadButtonText, { color: palette.text.primary }]}>0</Text>,
        )}
        <PressableScale
          style={cellStyle()}
          onPress={onBackspace}
          onPressIn={() => haptics.tap()}
          enabled={!disabled && filledCount > 0}
        >
          <Delete
            size={24}
            color={
              filledCount === 0 ? palette.text.secondary : backspaceActiveColor || palette.text.primary
            }
            strokeWidth={2}
          />
        </PressableScale>
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
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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
