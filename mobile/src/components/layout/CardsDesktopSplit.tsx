import React, { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { spacing } from '../../theme'

/** Business cards page left column width (`lg:grid-cols-[440px_1fr]`). */
export const CARDS_DESKTOP_LEFT_WIDTH = 440

type CardsDesktopSplitProps = {
  sidebar: ReactNode
  main: ReactNode
}

/** Two-column cards layout on desktop web — card carousel + actions | activity list. */
export function CardsDesktopSplit({ sidebar, main }: CardsDesktopSplitProps) {
  return (
    <View style={styles.row}>
      <View style={styles.sidebar}>{sidebar}</View>
      <View style={styles.main}>{main}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing[6],
    minHeight: 0,
    width: '100%',
  },
  sidebar: {
    width: CARDS_DESKTOP_LEFT_WIDTH,
    flexShrink: 0,
    gap: spacing[6],
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
})
