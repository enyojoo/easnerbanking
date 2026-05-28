import React from 'react'
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller'

type Props = KeyboardAwareScrollViewProps & {
  children: React.ReactNode
}

/**
 * Scroll surface that tracks the software keyboard — pilot replacement for KeyboardAvoidingView + ScrollView.
 */
export default function KeyboardAwareScreen({
  children,
  keyboardShouldPersistTaps = 'handled',
  bottomOffset = 16,
  ...props
}: Props) {
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      bottomOffset={bottomOffset}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  )
}
