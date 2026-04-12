import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import { motion } from '../theme/motion'
import { shouldPlayDecorativeMotionEnter } from '../theme/reduceMotion'

/**
 * When `ready` is true, runs one short parallel enter on all values (no stagger).
 * Honors reduce motion.
 */
export function useCalmParallelEnterWhen(ready: boolean, ...values: Animated.Value[]) {
  const valuesRef = useRef(values)
  valuesRef.current = values

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const vals = valuesRef.current

    void (async () => {
      const play = await shouldPlayDecorativeMotionEnter()
      if (cancelled) return
      if (!play) {
        vals.forEach((v) => v.setValue(1))
        return
      }
      Animated.parallel(
        vals.map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: motion.screenEnterMs,
            useNativeDriver: true,
          }),
        ),
      ).start()
    })()

    return () => {
      cancelled = true
    }
  }, [ready])
}
