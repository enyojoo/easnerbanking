import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { ScrollView as GestureHandlerScrollView } from 'react-native-gesture-handler'

/**
 * Dropdown panels inside recipient modals nested in parent scroll views.
 * On Android, nested FlatList often steals gestures; use this bounded scroll instead.
 */
const styles = StyleSheet.create({
  list: {
    maxHeight: 220,
    ...Platform.select({
      android: { flexGrow: 0 },
    }),
  },
})

export default function RecipientFormDropdownList({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerScrollView
      style={styles.list}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      {children}
    </GestureHandlerScrollView>
  )
}
