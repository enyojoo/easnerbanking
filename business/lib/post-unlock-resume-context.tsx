"use client"

import React, { createContext, useContext, useEffect, useMemo, useState } from "react"

const PostUnlockResumeContext = createContext<{ until: number; version: number } | null>(null)

/** Wraps authenticated shell children; `version`/`until` bump when PIN unlock completes. */
export function PostUnlockResumeProvider({
  children,
  resumeUntil,
  resumeVersion,
}: {
  children: React.ReactNode
  resumeUntil: number
  resumeVersion: number
}) {
  const value = useMemo(
    () => ({ until: resumeUntil, version: resumeVersion }),
    [resumeUntil, resumeVersion],
  )
  return <PostUnlockResumeContext.Provider value={value}>{children}</PostUnlockResumeContext.Provider>
}

/**
 * True for a few seconds after PIN unlock so scoped queries can show skeletons while
 * refetching empty persisted cache (without flashing “No transactions” or $0).
 */
export function useIsPostUnlockResumeActive(): boolean {
  const ctx = useContext(PostUnlockResumeContext)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!ctx || ctx.version === 0) {
      setActive(false)
      return
    }
    const now = Date.now()
    if (now >= ctx.until) {
      setActive(false)
      return
    }
    setActive(true)
    const ms = ctx.until - now
    const id = window.setTimeout(() => setActive(false), ms)
    return () => window.clearTimeout(id)
  }, [ctx])

  return active
}
