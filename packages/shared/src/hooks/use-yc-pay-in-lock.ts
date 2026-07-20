"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type YcPayInLockStatus = "idle" | "loading" | "locked" | "error"

export type UseYcPayInLockInput<T> = {
  enabled: boolean
  lockKey: string
  getCachedLocked: () => T | null
  isLocked: (value: T) => boolean
  lock: () => Promise<T | null>
  getErrorMessage?: () => string | null
  defaultErrorMessage?: string
}

export type UseYcPayInLockResult<T> = {
  status: YcPayInLockStatus
  quote: T | null
  error: string | null
  isLocked: boolean
  isLoading: boolean
  retry: () => void
}

/** Lock YC pay-in order on mount (Noah payout review pattern). */
export function useYcPayInLock<T>(input: UseYcPayInLockInput<T>): UseYcPayInLockResult<T> {
  const {
    enabled,
    lockKey,
    getCachedLocked,
    isLocked,
    lock,
    getErrorMessage,
    defaultErrorMessage = "Could not lock payment details",
  } = input

  const [status, setStatus] = useState<YcPayInLockStatus>("idle")
  const [quote, setQuote] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const attemptRef = useRef(0)

  const lockRef = useRef(lock)
  lockRef.current = lock
  const getCachedRef = useRef(getCachedLocked)
  getCachedRef.current = getCachedLocked
  const isLockedRef = useRef(isLocked)
  isLockedRef.current = isLocked
  const getErrorRef = useRef(getErrorMessage)
  getErrorRef.current = getErrorMessage

  const runLock = useCallback(async () => {
    if (!enabled || !lockKey) return

    const cached = getCachedRef.current()
    if (cached && isLockedRef.current(cached)) {
      setQuote(cached)
      setStatus("locked")
      setError(null)
      return
    }

    setStatus("loading")
    setError(null)
    const attempt = ++attemptRef.current

    try {
      const result = await lockRef.current()
      if (attempt !== attemptRef.current) return

      if (result && isLockedRef.current(result)) {
        setQuote(result)
        setStatus("locked")
        setError(null)
        return
      }

      setStatus("error")
      setError(getErrorRef.current?.() ?? defaultErrorMessage)
    } catch (e) {
      if (attempt !== attemptRef.current) return
      setStatus("error")
      setError(e instanceof Error ? e.message : defaultErrorMessage)
    }
  }, [enabled, lockKey, defaultErrorMessage])

  useEffect(() => {
    if (!enabled || !lockKey) {
      setStatus("idle")
      setQuote(null)
      setError(null)
      return
    }

    const cached = getCachedRef.current()
    if (cached && isLockedRef.current(cached)) {
      setQuote(cached)
      setStatus("locked")
      setError(null)
      return
    }

    void runLock()
  }, [enabled, lockKey, runLock])

  const retry = useCallback(() => {
    void runLock()
  }, [runLock])

  return {
    status,
    quote,
    error,
    isLocked: status === "locked",
    isLoading: status === "loading",
    retry,
  }
}
