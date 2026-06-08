import { StyleSheet } from 'react-native'
import { useOptionalResponsiveLayout } from '../contexts/ResponsiveLayoutContext'
import { borderRadius, shadows, spacing } from '../theme'

/**
 * Centered dialog on web tablet/desktop shell only (≥600px, sidebar visible).
 * Mobile web and native keep bottom sheets / anchored pickers.
 */
export function useWebCenteredModal(): boolean {
  const layout = useOptionalResponsiveLayout()
  return layout?.showSidebarShell ?? false
}

export const webCenteredModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    padding: spacing[6],
  },
  panel: {
    width: '100%',
    maxWidth: 480,
    borderRadius: borderRadius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[6],
    ...shadows.lg,
  },
  panelCompact: {
    maxWidth: 400,
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  anchoredMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    alignItems: 'flex-end',
    paddingTop: spacing[4],
    paddingRight: spacing[8],
  },
  anchoredMenuPanel: {
    minWidth: 200,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[1],
    ...shadows.lg,
  },
})
