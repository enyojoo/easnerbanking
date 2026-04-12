import React from 'react'
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Extra offset for stack headers; defaults to safe-area top on iOS. */
  keyboardVerticalOffset?: number
}

/**
 * Pattern B: wrap screens whose main scroll surface is FlatList/SectionList.
 * Do not nest those lists inside ScrollView. Apply keyboardShouldPersistTaps on the list.
 */
export default function KeyboardSafeContainer({
  children,
  style,
  keyboardVerticalOffset,
}: Props) {
  const insets = useSafeAreaInsets()
  const offset =
    keyboardVerticalOffset !== undefined
      ? keyboardVerticalOffset
      : Platform.OS === 'ios'
        ? insets.top
        : 0

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  )
}
