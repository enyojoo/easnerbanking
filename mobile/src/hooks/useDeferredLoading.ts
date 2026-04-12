import { useEffect, useState } from 'react'

const DEFAULT_DELAY_MS = 220

/**
 * Becomes true only if `active` stays true for `delayMs`.
 * Use for spinners so fast async work (e.g. local PIN verify) never flashes a loading UI.
 */
export function useDeferredLoading(active: boolean, delayMs: number = DEFAULT_DELAY_MS): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!active) {
      setShow(false)
      return
    }
    const id = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(id)
  }, [active, delayMs])

  return show
}
