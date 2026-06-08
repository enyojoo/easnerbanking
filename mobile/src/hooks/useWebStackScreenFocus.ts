import { useCallback, useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { Platform, View } from 'react-native'
import { blurActiveElementOnWeb } from '../lib/webFocus'

type WebFocusTargetProps = {
  ref: React.RefObject<View | null>
  focusable: boolean
  tabIndex: number
  accessibilityElementsHidden: boolean
}

const noopWebFocusTargetProps = {} as const

/**
 * Moves keyboard/screen-reader focus into the active stack screen on web after navigation.
 */
export function useWebStackScreenFocus(): { webFocusTargetProps: WebFocusTargetProps | {} } {
  const focusRef = useRef<View>(null)

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') return

      const frame = requestAnimationFrame(() => {
        const node = focusRef.current as unknown as { focus?: () => void } | null
        node?.focus?.()
      })

      return () => {
        cancelAnimationFrame(frame)
        blurActiveElementOnWeb()
      }
    }, []),
  )

  if (Platform.OS !== 'web') {
    return { webFocusTargetProps: noopWebFocusTargetProps }
  }

  return {
    webFocusTargetProps: {
      ref: focusRef,
      focusable: true,
      tabIndex: -1,
      accessibilityElementsHidden: true,
    },
  }
}
