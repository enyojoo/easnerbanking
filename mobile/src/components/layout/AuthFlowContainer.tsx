import React, { type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { spacing } from '../../theme'

const AUTH_FLOW_MAX_WIDTH = 448

type AuthFlowContainerProps = {
  children: ReactNode
}

/** Centered auth column for web and regular-width surfaces. */
export function AuthFlowContainer({ children }: AuthFlowContainerProps) {
  return (
    <View style={styles.root}>
      <View style={styles.column}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? AUTH_FLOW_MAX_WIDTH : undefined,
    alignSelf: 'center',
    paddingHorizontal: spacing[5],
  },
})
