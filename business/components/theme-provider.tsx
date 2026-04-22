'use client'

import * as React from 'react'
import type { ThemeProviderProps } from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // `next-themes` renders an inline <script> to sync theme early.
  // With React 19 + Next 16, this triggers a console error in our setup.
  // Easner Business currently uses a light-first theme; keep the provider as a
  // no-op wrapper until we revisit dark mode.
  void props
  return <>{children}</>
}
