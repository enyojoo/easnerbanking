import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { UsBankTransferMethodOption, UsBankTransferType } from '@easner/shared'
import {
  borderRadius,
  colors,
  fontFamily,
  spacing,
  textStyles,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'

type Props = {
  methods: UsBankTransferMethodOption[]
  value: UsBankTransferType | null
  onChange: (value: UsBankTransferType) => void
  disabled?: boolean
}

function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

/** Equal-height 2-col USD rail picker. Every tile reserves a timing chip. */
export function UsTransferTypeGrid({ methods, value, onChange, disabled }: Props) {
  if (methods.length === 0) return null

  return (
    <View style={styles.container}>
      {chunkPairs(methods).map((row) => (
        <View key={row.map((method) => method.value).join('-')} style={styles.row}>
          {row.map((method) => {
            const selected = value === method.value
            return (
              <Pressable
                key={method.value}
                android_ripple={ripple.neutral}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: Boolean(disabled) }}
                accessibilityLabel={`${method.label}, ${method.speedLabel}`}
                style={[
                  styles.tile,
                  selected && styles.tileSelected,
                  disabled && styles.tileDisabled,
                ]}
                onPress={() => {
                  onChange(method.value)
                  haptics.tap()
                }}
              >
                <Text
                  style={[styles.label, selected && styles.labelSelected]}
                  numberOfLines={1}
                >
                  {method.label}
                </Text>
                <View style={[styles.chip, selected && styles.chipSelected]}>
                  <Text
                    style={[styles.chipText, selected && styles.chipTextSelected]}
                    numberOfLines={1}
                  >
                    {method.speedLabel}
                  </Text>
                </View>
              </Pressable>
            )
          })}
          {row.length === 1 ? <View style={styles.tileSpacer} /> : null}
        </View>
      ))}
    </View>
  )
}

const TILE_HEIGHT = 72

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[2],
    gap: spacing[2],
  },
  row: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  tile: {
    flex: 1,
    height: TILE_HEIGHT,
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  tileSelected: {
    backgroundColor: colors.primary.main + '15',
    borderColor: colors.primary.main,
  },
  tileDisabled: {
    opacity: 0.55,
  },
  tileSpacer: {
    flex: 1,
  },
  label: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  labelSelected: {
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  chip: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.muted,
    maxWidth: '100%',
  },
  chipSelected: {
    backgroundColor: colors.primary.main + '22',
  },
  chipText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  chipTextSelected: {
    color: colors.primary.main,
  },
})
