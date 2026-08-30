import React, { useEffect, useRef } from 'react'
import { isStripeHostElement } from '../../lib/expressStripeElement'

export function ExpressStripeHost({ element }: { element: unknown }) {
  const ref = useRef<HTMLDivElement>(null)
  const mountedElementRef = useRef<unknown>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return

    if (!isStripeHostElement(element)) {
      if (mountedElementRef.current && host.contains(mountedElementRef.current as Node)) {
        host.removeChild(mountedElementRef.current as Node)
      }
      mountedElementRef.current = null
      return
    }

    if (mountedElementRef.current === element && host.contains(element)) {
      return
    }

    host.replaceChildren()
    host.appendChild(element)
    mountedElementRef.current = element

    return () => {
      if (mountedElementRef.current === element && host.contains(element)) {
        host.removeChild(element)
      }
      if (mountedElementRef.current === element) {
        mountedElementRef.current = null
      }
    }
  }, [element])

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        minHeight: 280,
        overflow: 'visible',
      }}
    />
  )
}
