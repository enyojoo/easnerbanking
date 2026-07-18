import { useCallback, useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Clipboard from 'expo-clipboard'

type UseOtpClipboardAutofillOptions = {
  enabled: boolean
  value: string
  onAutofill: (digits: string) => void
  length?: number
}

export function extractClipboardOtp(raw: string, length: number): string | null {
  const trimmed = String(raw || '').trim()
  const exact = new RegExp(`^\\d{${length}}$`)
  if (exact.test(trimmed)) return trimmed

  const digitsOnly = trimmed.replace(/\D/g, '')
  if (digitsOnly.length === length) return digitsOnly

  const embedded = trimmed.match(new RegExp(`\\d{${length}}`))
  return embedded ? embedded[0] : null
}

/**
 * Auto-fill OTP boxes when a matching code is already on the clipboard.
 *
 * We only accept a clipboard value that is exactly `length` digits so we do
 * not accidentally consume random numbers copied from elsewhere.
 */
export function useOtpClipboardAutofill({
  enabled,
  value,
  onAutofill,
  length = 6,
}: UseOtpClipboardAutofillOptions) {
  const usedDigitsRef = useRef<Set<string>>(new Set())
  const clipboardReadBlockedRef = useRef(false)
  const readInFlightRef = useRef(false)
  const hasSeenEligibleFocusRef = useRef(false)
  const enabledRef = useRef(enabled)
  const valueRef = useRef(value)
  const onAutofillRef = useRef(onAutofill)
  const lengthRef = useRef(length)

  useEffect(() => {
    enabledRef.current = enabled
    valueRef.current = value
    onAutofillRef.current = onAutofill
    lengthRef.current = length
  }, [enabled, value, onAutofill, length])

  const resetClipboardSession = useCallback(() => {
    usedDigitsRef.current.clear()
    clipboardReadBlockedRef.current = false
  }, [])

  const checkClipboard = useCallback(async () => {
    if (!enabledRef.current) return
    if (clipboardReadBlockedRef.current) return
    if (readInFlightRef.current) return

    readInFlightRef.current = true

    const nextLength = lengthRef.current
    const currentDigits = String(valueRef.current || '').replace(/\D/g, '').slice(0, nextLength)

    try {
      const raw = await Clipboard.getStringAsync()
      const nextDigits = extractClipboardOtp(raw, nextLength)
      if (!nextDigits) return
      if (nextDigits === currentDigits) return
      if (usedDigitsRef.current.has(nextDigits)) return

      usedDigitsRef.current.add(nextDigits)
      onAutofillRef.current(nextDigits)
    } catch {
      // If the OS denies pasteboard access, ignore further reads for this
      // screen session so we do not keep re-prompting.
      clipboardReadBlockedRef.current = true
    } finally {
      readInFlightRef.current = false
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!enabledRef.current) return undefined
      if (!hasSeenEligibleFocusRef.current) {
        hasSeenEligibleFocusRef.current = true
        return undefined
      }
      void checkClipboard()
      return undefined
    }, [checkClipboard]),
  )

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void checkClipboard()
      }
    })

    return () => {
      subscription.remove()
    }
  }, [checkClipboard, enabled])

  useEffect(() => {
    if (enabled) return
    hasSeenEligibleFocusRef.current = false
    resetClipboardSession()
  }, [enabled, resetClipboardSession])
}
