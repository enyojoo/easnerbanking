"use client"

import { useYcPayInLock, type UseYcPayInLockResult } from "./use-yc-pay-in-lock"

export type UseYcCrossBorderPayInLockInput<T> = {
  enabled: boolean
  lockKey: string
  getCachedLocked: () => T | null
  isLocked: (value: T) => boolean
  confirmOrder: () => Promise<T | null>
  getErrorMessage?: () => string | null
  defaultErrorMessage?: string
}

/** Cross-border pay-in: auto-lock via leg2 + `/cross-border/confirm` on review mount. */
export function useYcCrossBorderPayInLock<T>(
  input: UseYcCrossBorderPayInLockInput<T>,
): UseYcPayInLockResult<T> {
  const { confirmOrder, ...rest } = input
  return useYcPayInLock({
    ...rest,
    lock: confirmOrder,
    defaultErrorMessage: rest.defaultErrorMessage ?? "Could not lock transfer details",
  })
}
