import React, { type ReactNode } from 'react'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { DesktopShell } from './DesktopShell'

type ResponsiveAppShellProps = {
  children: ReactNode
}

export function ResponsiveAppShell({ children }: ResponsiveAppShellProps) {
  const { mode, isWeb } = useResponsiveLayout()

  if (!isWeb || mode !== 'desktop') {
    return <>{children}</>
  }

  return <DesktopShell>{children}</DesktopShell>
}
