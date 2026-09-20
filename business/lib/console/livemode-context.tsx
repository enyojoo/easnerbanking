"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { type ConsoleLivemode, parseConsoleLivemode } from "@/lib/console/livemode"

const STORAGE_KEY = "easner_console_livemode"

type ConsoleLivemodeContextValue = {
  livemode: ConsoleLivemode
  setLivemode: (next: ConsoleLivemode) => void
}

const ConsoleLivemodeContext = createContext<ConsoleLivemodeContextValue | null>(null)

function readStoredLivemode(): ConsoleLivemode {
  if (typeof window === "undefined") return "test"
  try {
    return parseConsoleLivemode(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return "test"
  }
}

/**
 * Persists Test/Live across the whole Developers section (localStorage, not
 * the URL) so switching via the sidebar — a plain `<Link>`, not a same-page
 * tab — never silently resets the mode back to test.
 */
export function ConsoleLivemodeProvider({ children }: { children: React.ReactNode }) {
  const [livemode, setLivemodeState] = useState<ConsoleLivemode>("test")

  useEffect(() => {
    setLivemodeState(readStoredLivemode())
  }, [])

  const setLivemode = useCallback((next: ConsoleLivemode) => {
    setLivemodeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Best-effort only.
    }
  }, [])

  return (
    <ConsoleLivemodeContext.Provider value={{ livemode, setLivemode }}>
      {children}
    </ConsoleLivemodeContext.Provider>
  )
}

export function useConsoleLivemode(): ConsoleLivemodeContextValue {
  const ctx = useContext(ConsoleLivemodeContext)
  if (!ctx) throw new Error("useConsoleLivemode must be used within ConsoleLivemodeProvider")
  return ctx
}
