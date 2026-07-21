"use client"

import { useYcPayInLock, type UseYcPayInLockResult } from "./use-yc-pay-in-lock"

export type UseYcFundBalancePayInLockInput<T> = {
  enabled: boolean
  lockKey: string
  getCachedLocked: () => T | null
  isLocked: (value: T) => boolean
  confirmOrder: () => Promise<T | null>
  getErrorMessage?: () => string | null
  defaultErrorMessage?: string
}

/** Fund-balance pay-in: lock via `/fund-balance/confirm` before review (Continue spinner). Review may re-read stash only. */
export function useYcFundBalancePayInLock<T>(
  input: UseYcFundBalancePayInLockInput<T>,
): UseYcPayInLockResult<T> {
  const { confirmOrder, ...rest } = input
  return useYcPayInLock({
    ...rest,
    lock: confirmOrder,
    defaultErrorMessage: rest.defaultErrorMessage ?? "Could not lock deposit details",
  })
}
