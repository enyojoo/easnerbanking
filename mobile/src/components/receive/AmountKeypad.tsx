import React from 'react'
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native'
import { Pressable } from 'react-native'
import { Delete } from 'lucide-react-native'
import {
  borderRadius,
  spacing,
  computeKeypadCellSize,
  getContentWidth,
  surfaceFrameStyle,
  colors,
  fontFamily,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'

export function formatKeypadAmount(rawValue: string): string {
  const input = String(rawValue || '').replace(/,/g, '').replace(/[^0-9.]/g, '')
  if (!input) return '0'

  const hasDot = input.includes('.')
  const [rawInteger = '0', rawDecimal = ''] = input.split('.')
  const normalizedInteger = rawInteger.replace(/^0+(?=\d)/, '') || '0'
  const formattedInteger = normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  if (!hasDot) return formattedInteger
  return `${formattedInteger}.${rawDecimal.slice(0, 2)}`
}

type Props = {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

export function AmountKeypad({ value, onChange, disabled }: Props) {
  const { width } = useWindowDimensions()
  const keypadSizing = computeKeypadCellSize(getContentWidth(width, spacing[5]), {
    gap: spacing[2],
    minSize: 50,
    maxSize: 113,
  })

  const handlePress = (key: string) => {
    if (disabled) return
    haptics.tap()
    let raw = value.replace(/,/g, '')

    if (key === 'backspace') {
      onChange(formatKeypadAmount(raw.slice(0, -1)))
      return
    }

    if (key === '.') {
      if (raw.includes('.')) return
      onChange(formatKeypadAmount(`${raw}.`))
      return
    }

    if (!/^\d$/.test(key)) return
    if (raw.includes('.')) {
      const decimals = raw.split('.')[1] ?? ''
      if (decimals.length >= 2) return
    }
    onChange(formatKeypadAmount(`${raw}${key}`))
  }

  const cellStyle = { width: keypadSizing.buttonWidth }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.grid,
          { width: keypadSizing.rowWidth, gap: keypadSizing.gap, rowGap: keypadSizing.gap },
        ]}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <Pressable
            key={num}
            android_ripple={ripple.neutral}
            style={[styles.button, cellStyle, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl })]}
            onPress={() => handlePress(String(num))}
            disabled={disabled}
          >
            <Text style={styles.buttonText}>{num}</Text>
          </Pressable>
        ))}
        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.button, cellStyle, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl })]}
          onPress={() => handlePress('.')}
          disabled={disabled}
        >
          <Text style={styles.buttonText}>.</Text>
        </Pressable>
        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.button, cellStyle, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl })]}
          onPress={() => handlePress('0')}
          disabled={disabled}
        >
          <Text style={styles.buttonText}>0</Text>
        </Pressable>
        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.button, cellStyle, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl })]}
          onPress={() => handlePress('backspace')}
          disabled={disabled || !value || value === '0'}
        >
          <Delete
            size={24}
            color={!value || value === '0' ? colors.text.secondary : colors.text.primary}
            strokeWidth={2}
          />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  button: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
  },
  buttonText: {
    fontSize: 28,
    lineHeight: 34,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
})
