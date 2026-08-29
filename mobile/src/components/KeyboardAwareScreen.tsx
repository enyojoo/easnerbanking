import React from 'react'
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller'

type Props = KeyboardAwareScrollViewProps & {
  children: React.ReactNode
}

/**
 * Scroll surface that tracks the software keyboard – pilot replacement for KeyboardAvoidingView + ScrollView.
 */
const KeyboardAwareScreen = React.forwardRef<
  React.ComponentRef<typeof KeyboardAwareScrollView>,
  Props
>(function KeyboardAwareScreen(
  { children, keyboardShouldPersistTaps = 'handled', bottomOffset = 16, ...props },
  ref,
) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      bottomOffset={bottomOffset}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  )
})

export default KeyboardAwareScreen
