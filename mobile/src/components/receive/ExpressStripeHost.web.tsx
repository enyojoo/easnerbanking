import React, { useEffect, useRef } from 'react'
import { isStripeHostElement } from '../../lib/expressStripeElement'

export function ExpressStripeHost({ element }: { element: unknown }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    host.replaceChildren()
    if (isStripeHostElement(element)) host.appendChild(element)
    return () => {
      host.replaceChildren()
    }
  }, [element])

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 280,
        overflow: 'auto',
      }}
    />
  )
}
