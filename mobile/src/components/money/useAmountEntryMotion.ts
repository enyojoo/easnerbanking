import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing } from 'react-native'
import { USE_NATIVE_DRIVER } from '../../lib/animation'

/**
 * Motion for an amount being typed on the keypad:
 * - `pulse('add')`: the figure lifts to 104% and settles (a digit landed).
 * - `pulse('remove')`: dips to 97% and settles (a digit was deleted).
 * - `shake()`: a short horizontal shake when a key is rejected (second ".", third decimal).
 *
 * Pulses are skipped with Reduce Motion; the shake still runs because it carries meaning.
 * Apply `style` to an `Animated.View` wrapping the amount row.
 */
export function useAmountEntryMotion() {
  const scale = useRef(new Animated.Value(1)).current
  const shakeX = useRef(new Animated.Value(0)).current
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => { if (alive) setReduceMotion(v) })
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])

  const pulse = useCallback(
    (kind: 'add' | 'remove') => {
      if (reduceMotion) return
      scale.stopAnimation()
      scale.setValue(1)
      Animated.sequence([
        Animated.timing(scale, {
          toValue: kind === 'add' ? 1.04 : 0.97,
          duration: 70,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 14,
          stiffness: 320,
          mass: 0.6,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start()
    },
    [reduceMotion, scale],
  )

  const shake = useCallback(() => {
    shakeX.stopAnimation()
    shakeX.setValue(0)
    const step = (toValue: number) =>
      Animated.timing(shakeX, { toValue, duration: 45, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER })
    Animated.sequence([step(-8), step(8), step(-5), step(5), step(0)]).start()
  }, [shakeX])

  const style = { transform: [{ translateX: shakeX }, { scale }] }

  return { style, pulse, shake }
}
