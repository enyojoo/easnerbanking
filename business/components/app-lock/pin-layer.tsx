"use client"

import { useLayoutEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * Mount PIN chrome on document.body so nested stacking (e.g. /pay install banner at z-50)
 * cannot paint in front of the lock screen.
 */
export function PinLayer({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    setTarget(document.body)
  }, [])

  if (!target) return children
  return createPortal(children, target)
}
