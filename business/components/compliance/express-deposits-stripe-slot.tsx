"use client"

import { useEffect, useRef } from "react"

type Props = {
  element: HTMLElement | null
  className?: string
}

export function ExpressDepositsStripeSlot({ element, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.replaceChildren()
    if (element) host.appendChild(element)
    return () => {
      host.replaceChildren()
    }
  }, [element])

  return <div ref={hostRef} className={className ?? "min-h-[240px] w-full overflow-hidden rounded-xl"} />
}
