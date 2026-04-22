'use client'

import * as React from 'react'
import type { ThemeProviderProps } from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // `next-themes` renders an inline <script> to sync theme early.
  // With React 19 + Next 16, this triggers a console error in our setup.
  // Business web is light-only (no header theme toggle); keep a no-op wrapper.
  void props
  return <>{children}</>
}
