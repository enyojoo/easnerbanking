import React, { useEffect, useState } from 'react'
import { EaseView } from 'react-native-ease'
import type { StyleProp, ViewStyle } from 'react-native'
import { motion } from '../theme/motion'
import { shouldPlayDecorativeMotionEnter } from '../theme/reduceMotion'

type EaseEnterProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Initial translateY offset; defaults to screen enter token (12px). */
  translateY?: number
  /** When false, renders children without enter animation (stack already animated). */
  enabled?: boolean
}

/**
 * Decorative screen/content enter — native spring via react-native-ease.
 * Honors reduce motion (instant, no animation).
 */
export default function EaseEnter({
  children,
  style,
  translateY = motion.screenEnterTranslateY,
  enabled = true,
}: EaseEnterProps) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    void (async () => {
      const play = await shouldPlayDecorativeMotionEnter()
      setReduceMotion(!play)
    })()
  }, [])

  if (!enabled || reduceMotion) {
    return <>{children}</>
  }

  const transition = { type: 'spring', damping: 28, stiffness: 320 } as const

  return (
    <EaseView
      style={style}
      initialAnimate={{ opacity: 0, translateY }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={transition}
    >
      {children}
    </EaseView>
  )
}
