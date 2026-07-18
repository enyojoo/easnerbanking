import React, { type ReactNode } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { ResponsivePage } from './ResponsivePage'
import { spacing } from '../../theme'

export const WEB_FLOW_MAX_WIDTH = 672

type CenteredWebFlowPageProps = {
  children: ReactNode
  contentStyle?: StyleProp<ViewStyle>
}

/** Centered single-column flow for tablet/desktop web (send, pay-in, etc.). */
export function CenteredWebFlowPage({ children, contentStyle }: CenteredWebFlowPageProps) {
  const { isWeb, mode } = useResponsiveLayout()
  const centered = isWeb && (mode === 'tablet' || mode === 'desktop')

  if (!centered) {
    return <>{children}</>
  }

  return (
    <ResponsivePage
      contentContainerStyle={[styles.column, contentStyle]}
      scrollContentStyle={styles.scrollContent}
    >
      {children}
    </ResponsivePage>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing[6],
  },
  column: {
    maxWidth: WEB_FLOW_MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
})
