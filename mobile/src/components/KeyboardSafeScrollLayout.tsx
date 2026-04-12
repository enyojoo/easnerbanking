import React from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = {
  children: React.ReactNode
  containerStyle?: StyleProp<ViewStyle>
  scrollViewStyle?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
  /** Extra bottom padding in addition to safe-area bottom (e.g. theme spacing). */
  bottomInsetExtra?: number
  keyboardVerticalOffset?: number
} & Omit<ScrollViewProps, 'contentContainerStyle' | 'style' | 'children'>

/**
 * Pattern A: form / column screens — KAV + ScrollView with keyboard-friendly defaults.
 */
export default function KeyboardSafeScrollLayout({
  children,
  containerStyle,
  scrollViewStyle,
  contentContainerStyle,
  bottomInsetExtra = 0,
  keyboardVerticalOffset,
  keyboardShouldPersistTaps = 'handled',
  showsVerticalScrollIndicator = false,
  ...scrollProps
}: Props) {
  const insets = useSafeAreaInsets()
  const offset =
    keyboardVerticalOffset !== undefined
      ? keyboardVerticalOffset
      : Platform.OS === 'ios'
        ? insets.top
        : 0

  const padBottom = Math.max(insets.bottom, 12) + bottomInsetExtra

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, containerStyle]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
    >
      <ScrollView
        style={[{ flex: 1 }, scrollViewStyle]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        contentContainerStyle={[{ flexGrow: 1, paddingBottom: padBottom }, contentContainerStyle]}
        {...scrollProps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
