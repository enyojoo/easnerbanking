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

  if (!isStripeHostElement(element)) return null
  return <div ref={ref} style={{ minHeight: 280, width: '100%' }} />
}
