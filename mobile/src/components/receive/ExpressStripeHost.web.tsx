import React, { useLayoutEffect, useRef } from 'react'
import { isStripeHostElement } from '../../lib/expressStripeElement'

export function ExpressStripeHost({ element }: { element: unknown }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const host = ref.current
    if (!host || !isStripeHostElement(element)) return
    if (element.closest('#easner-express-onramp-host, #easner-express-onramp-live')) return
    host.replaceChildren()
    host.appendChild(element)
    return () => {
      host.replaceChildren()
    }
  }, [element])

  if (!isStripeHostElement(element)) return null
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
