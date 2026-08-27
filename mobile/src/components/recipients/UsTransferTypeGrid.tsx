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

/** Single-row USD rail picker. Four tiles for Grid, two for Noah, equal height. */
export function UsTransferTypeGrid({ methods, value, onChange, disabled }: Props) {
  if (methods.length === 0) return null

  const compact = methods.length > 2

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {methods.map((method) => {
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
                compact && styles.tileCompact,
                selected && styles.tileSelected,
                disabled && styles.tileDisabled,
              ]}
              onPress={() => {
                onChange(method.value)
                haptics.tap()
              }}
            >
              <Text
                style={[styles.label, compact && styles.labelCompact, selected && styles.labelSelected]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {method.label}
              </Text>
              <View style={[styles.chip, compact && styles.chipCompact, selected && styles.chipSelected]}>
                <Text
                  style={[styles.chipText, compact && styles.chipTextCompact, selected && styles.chipTextSelected]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {method.speedLabel}
                </Text>
              </View>
            </Pressable>
          )
        })}
        {methods.length === 1 ? <View style={styles.tileSpacer} /> : null}
      </View>
    </View>
  )
}

const TILE_HEIGHT = 72

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[2],
  },
  row: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  tile: {
    flex: 1,
    minWidth: 0,
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
  tileCompact: {
    paddingHorizontal: spacing[1],
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
    minWidth: 0,
  },
  label: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  labelCompact: {
    fontSize: 13,
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
  chipCompact: {
    paddingHorizontal: 5,
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
  chipTextCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  chipTextSelected: {
    color: colors.primary.main,
  },
})
