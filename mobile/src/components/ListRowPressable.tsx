import React from 'react'
import { PressableScale } from 'pressto'
import type { StyleProp, ViewStyle } from 'react-native'

type ListRowPressableProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  onPressIn?: () => void
  enabled?: boolean
}

/**
 * List row press target — subtle scale (via global PressablesConfig minScale 0.97).
 * Preserves onPressIn for prefetch when provided.
 */
export function ListRowPressable({
  children,
  style,
  onPress,
  onPressIn,
  enabled = true,
}: ListRowPressableProps) {
  return (
    <PressableScale style={style} enabled={enabled} onPress={onPress} onPressIn={onPressIn}>
      {children}
    </PressableScale>
  )
}
