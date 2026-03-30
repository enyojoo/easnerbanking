import { useCallback, useRef, useState } from 'react'

/**
 * Promise-based PIN confirmation for sensitive actions. Pair with {@link PinChallengeModal}.
 */
export function useConfirmWithPin() {
  const [open, setOpen] = useState(false)
  const pendingRef = useRef<((ok: boolean) => void) | null>(null)

  const requestConfirm = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      pendingRef.current = resolve
      setOpen(true)
    })
  }, [])

  const onVerified = useCallback(() => {
    const resolve = pendingRef.current
    pendingRef.current = null
    resolve?.(true)
    setOpen(false)
  }, [])

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next && pendingRef.current) {
      const resolve = pendingRef.current
      pendingRef.current = null
      resolve(false)
    }
  }, [])

  return { open, requestConfirm, onVerified, onOpenChange }
}
