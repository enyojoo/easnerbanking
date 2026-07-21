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

function readCachedLocked<T>(
  enabled: boolean,
  lockKey: string,
  getCachedLocked: () => T | null,
  isLocked: (value: T) => boolean,
): T | null {
  if (!enabled || !lockKey) return null
  const cached = getCachedLocked()
  return cached && isLocked(cached) ? cached : null
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

  const lockRef = useRef(lock)
  lockRef.current = lock
  const getCachedRef = useRef(getCachedLocked)
  getCachedRef.current = getCachedLocked
  const isLockedRef = useRef(isLocked)
  isLockedRef.current = isLocked
  const getErrorRef = useRef(getErrorMessage)
  getErrorRef.current = getErrorMessage

  const readCachedFromRefs = useCallback((): T | null => {
    return readCachedLocked(enabled, lockKey, () => getCachedRef.current(), (value) =>
      isLockedRef.current(value),
    )
  }, [enabled, lockKey])

  const [status, setStatus] = useState<YcPayInLockStatus>(() =>
    readCachedLocked(enabled, lockKey, getCachedLocked, isLocked) ? "locked" : "idle",
  )
  const [quote, setQuote] = useState<T | null>(() =>
    readCachedLocked(enabled, lockKey, getCachedLocked, isLocked),
  )
  const [error, setError] = useState<string | null>(null)
  const attemptRef = useRef(0)
  const lockedKeyRef = useRef<string | null>(null)
  const quoteRef = useRef<T | null>(quote)
  quoteRef.current = quote

  const runLock = useCallback(async () => {
    if (!enabled || !lockKey) return

    if (
      lockedKeyRef.current === lockKey &&
      quoteRef.current &&
      isLockedRef.current(quoteRef.current)
    ) {
      return
    }

    const cached = readCachedFromRefs()
    if (cached) {
      lockedKeyRef.current = lockKey
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
        lockedKeyRef.current = lockKey
        setQuote(result)
        setStatus("locked")
        setError(null)
        return
      }

      lockedKeyRef.current = null
      setStatus("error")
      setError(getErrorRef.current?.() ?? defaultErrorMessage)
    } catch (e) {
      if (attempt !== attemptRef.current) return
      lockedKeyRef.current = null
      setStatus("error")
      setError(e instanceof Error ? e.message : defaultErrorMessage)
    }
  }, [enabled, lockKey, defaultErrorMessage, readCachedFromRefs])

  useEffect(() => {
    if (!enabled || !lockKey) {
      lockedKeyRef.current = null
      setStatus("idle")
      setQuote(null)
      setError(null)
      return
    }

    const cached = readCachedFromRefs()
    if (cached) {
      lockedKeyRef.current = lockKey
      setQuote(cached)
      setStatus("locked")
      setError(null)
      return
    }

    if (
      lockedKeyRef.current === lockKey &&
      quoteRef.current &&
      isLockedRef.current(quoteRef.current)
    ) {
      setStatus("locked")
      return
    }

    if (lockedKeyRef.current !== lockKey) {
      lockedKeyRef.current = null
      setQuote(null)
      setStatus("idle")
    }

    void runLock()
  }, [enabled, lockKey, runLock, readCachedFromRefs])

  const retry = useCallback(() => {
    lockedKeyRef.current = null
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
