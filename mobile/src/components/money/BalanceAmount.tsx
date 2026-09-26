import React, { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PixelRatio,
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { USE_NATIVE_DRIVER } from '../../lib/animation'
import { BALANCE_MASK, getBalanceFontSize, splitBalance, type BalanceParts } from '../../lib/balanceDisplay'

export type BalanceAmountSize = 'hero' | 'row'

const SIZES: Record<BalanceAmountSize, { minorScale: number; minSize: number; lineRatio: number }> = {
  /** Home balance: cents at 60%, shrinks down to 28 for long values. */
  hero: { minorScale: 0.6, minSize: 28, lineRatio: 1.1 },
  /** Picker and list rows (16px): cents at 80% so they stay legible. */
  row: { minorScale: 0.8, minSize: 13, lineRatio: 1.35 },
}

/** Roll between values: ~0.36s, ease-out. */
const ROLL_MS = 360
const MASK_FADE_MS = 150

type Props = {
  /** Balance in major units; `null` renders nothing (caller shows its own placeholder). */
  amount: number | null
  currency: string
  /** Replace the figure with `••••••`. */
  hidden?: boolean
  size?: BalanceAmountSize
  /** Largest font size for short balances. */
  maxFontSize: number
  minFontSize?: number
  color?: string
  /** Family, weight, letter spacing. Font size and line height are set here. */
  textStyle?: StyleProp<TextStyle>
  style?: StyleProp<ViewStyle>
  /** Roll to the new value when it changes while on screen. Defaults to true for `hero`. */
  animateChanges?: boolean
  /** Upper bound for system font scaling on top of `maxFontSize` (hero sizes are pre-scaled). */
  maxFontSizeMultiplier?: number
}

type Frame = { key: string; value: number | null; parts: BalanceParts | null; hidden: boolean; fontSize: number; lineHeight: number }

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => { if (alive) setReduce(v) })
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])
  return reduce
}

/**
 * A balance with smaller cents that shrinks to fit its width as the value grows,
 * and rolls to the new value when it changes on screen.
 */
export function BalanceAmount({
  amount,
  currency,
  hidden = false,
  size = 'hero',
  maxFontSize,
  minFontSize,
  color,
  textStyle,
  style,
  animateChanges,
  maxFontSizeMultiplier,
}: Props) {
  const spec = SIZES[size]
  const [width, setWidth] = useState(0)
  const reduceMotion = useReduceMotion()
  const shouldAnimate = (animateChanges ?? size === 'hero') && !reduceMotion

  const parts = amount == null ? null : splitBalance(amount, currency)
  const multiplier = maxFontSizeMultiplier ?? (size === 'hero' ? 1 : 1.4)
  const fontScale = Math.min(PixelRatio.getFontScale(), multiplier)
  const fontSize = parts && !hidden
    ? getBalanceFontSize(parts, width / fontScale, {
        maxSize: maxFontSize,
        minSize: minFontSize ?? spec.minSize,
        minorScale: spec.minorScale,
      })
    : maxFontSize
  const lineHeight =
    size === 'hero'
      ? Math.round(fontSize * spec.lineRatio) + (Platform.OS === 'android' ? 6 : 4)
      : Math.round(fontSize * spec.lineRatio)

  const current: Frame = {
    key: hidden ? 'mask' : parts?.text ?? '',
    value: amount,
    parts,
    hidden,
    fontSize,
    lineHeight,
  }

  const lastFrame = useRef<Frame | null>(null)
  const [outgoing, setOutgoing] = useState<Frame | null>(null)
  const [direction, setDirection] = useState(0)
  const progress = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const prev = lastFrame.current
    lastFrame.current = current
    if (!prev || prev.key === current.key || !prev.key || !current.key || !shouldAnimate) return
    let dir = 0
    if (!prev.hidden && !current.hidden && prev.value != null && current.value != null) {
      dir = current.value >= prev.value ? 1 : -1
    }
    setDirection(dir)
    setOutgoing(prev)
    progress.setValue(0)
    Animated.timing(progress, {
      toValue: 1,
      duration: dir === 0 ? MASK_FADE_MS : ROLL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) setOutgoing(null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.key])

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width)
    if (w !== width) setWidth(w)
  }

  if (!current.key) return <View style={style} onLayout={onLayout} />

  const renderFrame = (frame: Frame) => (
    <Text
      style={[textStyle, styles.figure, { fontSize: frame.fontSize, lineHeight: frame.lineHeight }, color ? { color } : null]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      maxFontSizeMultiplier={multiplier}
    >
      {frame.hidden || !frame.parts ? (
        BALANCE_MASK
      ) : (
        <>
          {frame.parts.sign}
          {frame.parts.symbol}
          {frame.parts.major}
          {frame.parts.minor ? (
            <Text style={{ fontSize: Math.round(frame.fontSize * spec.minorScale) }}>{frame.parts.minor}</Text>
          ) : null}
        </>
      )}
    </Text>
  )

  const offset = lineHeight * 0.45
  const incomingStyle = outgoing
    ? {
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [direction * offset, 0] }) }],
      }
    : null
  const outgoingStyle = outgoing
    ? {
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -direction * offset] }) }],
      }
    : null

  return (
    <View
      style={[styles.container, { minHeight: lineHeight }, style]}
      onLayout={onLayout}
      accessible
      accessibilityRole="text"
      accessibilityLabel={hidden ? 'Balance hidden' : parts?.text}
    >
      <Animated.View style={incomingStyle}>{renderFrame(current)}</Animated.View>
      {outgoing ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, outgoingStyle]}>
          {renderFrame(outgoing)}
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  figure: {
    fontVariant: ['tabular-nums'],
    ...Platform.select({ android: { includeFontPadding: false }, default: {} }),
  },
})

export default BalanceAmount
