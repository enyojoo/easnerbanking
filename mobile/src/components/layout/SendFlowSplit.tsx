import React, { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { spacing } from '../../theme'

type SendFlowSplitProps = {
  form: ReactNode
  preview?: ReactNode
}

/** Two-column send/receive layout on desktop web. */
export function SendFlowSplit({ form, preview }: SendFlowSplitProps) {
  const { mode } = useResponsiveLayout()

  if (mode !== 'desktop' || !preview) {
    return <>{form}</>
  }

  return (
    <View style={styles.row}>
      <View style={styles.formPane}>{form}</View>
      <View style={styles.previewPane}>{preview}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[6],
    width: '100%',
  },
  formPane: {
    flex: 1.1,
    minWidth: 0,
  },
  previewPane: {
    flex: 0.9,
    minWidth: 0,
  },
})
