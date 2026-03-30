import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { colors, borderRadius, spacing } from '../../theme'

type Props = {
  onDigit: (d: string) => void
  onBackspace: () => void
  disabled?: boolean
  filledCount: number
}

/** 3×4 numeric keypad + backspace (matches unlock / app-lock spec). */
export function PinKeypad({ onDigit, onBackspace, disabled, filledCount }: Props) {
  return (
    <View style={styles.keypadContainer}>
      <View style={styles.keypadGrid}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <TouchableOpacity
            key={num}
            style={styles.keypadButton}
            onPress={() => {
              onDigit(String(num))
            }}
            onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            activeOpacity={0.6}
            disabled={disabled}
          >
            <Text style={styles.keypadButtonText}>{num}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.keypadBottomRow}>
        <View style={styles.keypadButtonSpacer} />
        <TouchableOpacity
          style={styles.keypadButton}
          onPress={() => onDigit('0')}
          onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          activeOpacity={0.6}
          disabled={disabled}
        >
          <Text style={styles.keypadButtonText}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.keypadButton}
          onPress={onBackspace}
          onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          activeOpacity={0.6}
          disabled={disabled || filledCount === 0}
        >
          <Ionicons
            name="backspace"
            size={24}
            color={filledCount === 0 ? colors.text.secondary : colors.text.primary}
          />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  keypadContainer: {
    width: '100%',
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing[5],
    marginBottom: spacing[4],
  },
  keypadButton: {
    width: 72,
    height: 72,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  keypadButtonText: {
    fontSize: 26,
    lineHeight: 32,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    fontWeight: '600',
  },
  keypadBottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[5],
    paddingHorizontal: spacing[5],
  },
  keypadButtonSpacer: {
    width: 72,
  },
})
