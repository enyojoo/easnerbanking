import React from 'react'
import { View, StyleSheet, Animated, type StyleProp, type ViewStyle } from 'react-native'
import { PostHogMaskView } from 'posthog-react-native'
import { EaseView } from 'react-native-ease'
import { colors, spacing } from '../../theme'

type Props = {
  filledLength: number
  hasError?: boolean
  disabled?: boolean
  shakeStyle?: StyleProp<Animated.WithAnimatedValue<ViewStyle>>
}

/** Four PIN indicator dots (same layout as unlock screen). */
export function PinDotsRow({ filledLength, hasError, disabled, shakeStyle }: Props) {
  return (
    <PostHogMaskView>
      <Animated.View style={[styles.row, shakeStyle]}>
        {[0, 1, 2, 3].map((i) => {
          const filled = i < filledLength
          return (
            <EaseView
              key={i}
              initialAnimate={{ scale: filled ? 0.85 : 1 }}
              animate={{ scale: filled ? 1 : 1 }}
              transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            >
              <View
                style={[
                  styles.dot,
                  filled && styles.dotFilled,
                  hasError && styles.dotError,
                  disabled && styles.dotDisabled,
                ]}
              />
            </EaseView>
          )
        })}
      </Animated.View>
    </PostHogMaskView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[4],
    marginBottom: spacing[4],
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.background.secondary,
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },
  dotFilled: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  dotError: {
    borderColor: colors.error.main,
  },
  dotDisabled: {
    opacity: 0.5,
  },
})
