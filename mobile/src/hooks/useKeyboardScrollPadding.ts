import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/** Extra ScrollView content padding while the software keyboard is open. */
export function useKeyboardScrollPadding(): number {
  const [padding, setPadding] = useState(0)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (e) => {
      setPadding(e.endCoordinates.height)
    })
    const hide = Keyboard.addListener(hideEvent, () => setPadding(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return padding
}
