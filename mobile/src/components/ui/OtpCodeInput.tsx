import React, { useCallback, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  StyleProp,
  TextStyle,
  ViewStyle,
  Pressable,
  InteractionManager,
  ActivityIndicator,
} from 'react-native'
import { colors, spacing, textStyles } from '../../theme'
import { otpCodeBoxStyles, OTP_CODE_BOX_H } from '../../theme/otpCodeBoxVisual'
import { useOtpClipboardAutofill } from '../../hooks/useOtpClipboardAutofill'

export interface OtpCodeInputProps {
  /** Defaults to `otp-code` */
  id?: string
  label?: string
  length?: number
  value: string
  onChange: (digits: string) => void
  /** Fired once when `length` digits are entered (typing, paste, or clipboard autofill). */
  onComplete?: (digits: string) => void
  autoFocus?: boolean
  disabled?: boolean
  onFocus?: () => void
  /** Outer wrapper (e.g. opacity when submitting) */
  containerStyle?: StyleProp<ViewStyle>
  /** Center the label text above the OTP boxes. */
  centerLabel?: boolean
  /** Optional extra spacing between label and OTP boxes. */
  labelStyle?: StyleProp<TextStyle>
  /**
   * Read clipboard on focus return / foreground for a matching code.
   * @default true
   */
  clipboardAutofill?: boolean
  /** Show a spinner instead of digit boxes while verifying. */
  loading?: boolean
}

/**
 * Single invisible input over digit boxes – same pattern as web `OtpCodeInput` / PIN boxes.
 */
export function OtpCodeInput({
  id = 'otp-code',
  label,
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  onFocus,
  containerStyle,
  centerLabel = false,
  labelStyle,
  clipboardAutofill = true,
  loading = false,
}: OtpCodeInputProps) {
  const inputRef = useRef<TextInput>(null)
  const didAutoFocusRef = useRef(false)
  const digits = value.replace(/\D/g, '').slice(0, length)
  const activeIndex = Math.min(digits.length, length - 1)

  const applyDigits = useCallback(
    (raw: string) => {
      const next = raw.replace(/\D/g, '').slice(0, length)
      const wasComplete = value.replace(/\D/g, '').slice(0, length).length === length
      onChange(next)
      if (next.length === length && !wasComplete) onComplete?.(next)
    },
    [length, onChange, onComplete, value],
  )

  const focusInput = useCallback(() => {
    if (disabled) return
    inputRef.current?.focus()
  }, [disabled])

  useEffect(() => {
    if (!autoFocus || disabled) return
    if (didAutoFocusRef.current) return

    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        didAutoFocusRef.current = true
      })
    })

    return () => task.cancel()
  }, [autoFocus, disabled])

  const { checkClipboard } = useOtpClipboardAutofill({
    enabled: clipboardAutofill && !disabled && !loading,
    value: digits,
    onAutofill: applyDigits,
    length,
  })

  const handleFocus = () => {
    void checkClipboard()
    onFocus?.()
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
      <Pressable
        style={styles.inputStack}
        onPress={focusInput}
        disabled={disabled || loading}
        accessibilityLabel={label ? undefined : 'One-time code'}
        accessibilityRole="none"
        accessibilityHint="Tap to enter or paste your verification code"
      >
        <View style={otpCodeBoxStyles.boxRow} pointerEvents="none">
          {loading ? (
            <View style={otpCodeBoxStyles.boxesLoadingOnly}>
              <ActivityIndicator size="small" color={colors.primary.main} />
            </View>
          ) : (
            Array.from({ length }, (_, i) => (
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
            ))
          )}
        </View>
        <TextInput
          ref={inputRef}
          nativeID={id}
          value={digits}
          onChangeText={applyDigits}
          keyboardType={Platform.OS === 'ios' ? 'default' : 'numeric'}
          inputMode="numeric"
          maxLength={length}
          editable={!disabled && !loading}
          onFocus={handleFocus}
          caretHidden
          showSoftInputOnFocus
          autoCapitalize="none"
          autoCorrect={false}
          contextMenuHidden={false}
          {...(Platform.OS === 'ios'
            ? { textContentType: 'oneTimeCode' as const }
            : { autoComplete: 'sms-otp' as const })}
          spellCheck={false}
          importantForAutofill="yes"
          style={styles.hiddenInput}
          selectionColor="transparent"
        />
      </Pressable>
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
    fontSize: 16,
    color: 'transparent',
    backgroundColor: 'transparent',
    zIndex: 2,
  },
})
