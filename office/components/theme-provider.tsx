"use client"

import * as React from "react"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Office is light-only (no theme toggle); keep a no-op wrapper like business.
  return <>{children}</>
}
