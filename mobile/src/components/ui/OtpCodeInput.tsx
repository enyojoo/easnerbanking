import React from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native'
import { colors, spacing, textStyles } from '../../theme'
import { otpCodeBoxStyles, OTP_CODE_BOX_H } from '../../theme/otpCodeBoxVisual'

export interface OtpCodeInputProps {
  /** Defaults to `otp-code` */
  id?: string
  label?: string
  length?: number
  value: string
  onChange: (digits: string) => void
  autoFocus?: boolean
  disabled?: boolean
  onFocus?: () => void
  /** Outer wrapper (e.g. opacity when submitting) */
  containerStyle?: StyleProp<ViewStyle>
  /** Center the label text above the OTP boxes. */
  centerLabel?: boolean
  /** Optional extra spacing between label and OTP boxes. */
  labelStyle?: StyleProp<TextStyle>
}

/**
 * Single invisible input over digit boxes — same pattern as web `OtpCodeInput` / PIN boxes.
 */
export function OtpCodeInput({
  id = 'otp-code',
  label,
  length = 6,
  value,
  onChange,
  autoFocus,
  disabled,
  onFocus,
  containerStyle,
  centerLabel = false,
  labelStyle,
}: OtpCodeInputProps) {
  const digits = value.replace(/\D/g, '').slice(0, length)
  const activeIndex = Math.min(digits.length, length - 1)

  const handleChange = (t: string) => {
    onChange(t.replace(/\D/g, '').slice(0, length))
  }

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text
          style={[styles.label, centerLabel ? styles.labelCentered : undefined, labelStyle]}
          accessibilityRole="text"
        >
          {label}
        </Text>
      ) : null}
      <View style={styles.inputStack} accessibilityLabel={label ? undefined : 'One-time code'}>
        <View style={otpCodeBoxStyles.boxRow}>
          {Array.from({ length }, (_, i) => (
            <View
              key={i}
              style={[
                otpCodeBoxStyles.box,
                activeIndex === i ? otpCodeBoxStyles.boxActive : otpCodeBoxStyles.boxIdle,
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text
                style={otpCodeBoxStyles.digit}
                maxFontSizeMultiplier={1.4}
                {...Platform.select({
                  ios: { fontVariant: ['tabular-nums'] as const },
                })}
              >
                {digits[i] ?? ''}
              </Text>
            </View>
          ))}
        </View>
        <TextInput
          nativeID={id}
          value={digits}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={length}
          editable={!disabled}
          autoFocus={autoFocus}
          onFocus={onFocus}
          caretHidden
          {...(Platform.OS === 'ios'
            ? { textContentType: 'oneTimeCode' as const }
            : { autoComplete: 'off' as const })}
          spellCheck={false}
          importantForAutofill="yes"
          style={styles.hiddenInput}
          selectionColor="transparent"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing[4],
  },
  label: {
    ...textStyles.labelLarge,
    color: colors.text.secondary,
    marginBottom: spacing[2],
  },
  labelCentered: {
    textAlign: 'center',
  },
  inputStack: {
    position: 'relative',
    alignSelf: 'center',
    minHeight: OTP_CODE_BOX_H,
    justifyContent: 'center',
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    zIndex: 2,
  },
})
