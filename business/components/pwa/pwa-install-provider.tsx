"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"

const DISMISS_KEY = "easner_pwa_install_dismissed_at"
const COOLDOWN_MS = 60 * 60 * 1000

function readDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const t = Number.parseInt(raw, 10)
    return Number.isFinite(t) && Date.now() - t < COOLDOWN_MS
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  const mq = window.matchMedia("(display-mode: standalone)")
  const ios =
    "standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return mq.matches || ios
}

function isIos(): boolean {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** Install affordance for `/pay`: `beforeinstallprompt` when available; iOS manual copy. */
export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ""
  const [deferredPrompt, setDeferredPrompt] = useState<
    Event & { prompt: () => Promise<void> }
  | null>(null)
  const [showAndroid, setShowAndroid] = useState(false)
  const [showIosCard, setShowIosCard] = useState(false)

  useEffect(() => {
    if (!pathname.startsWith("/pay")) {
      setShowAndroid(false)
      setShowIosCard(false)
      setDeferredPrompt(null)
      return
    }
    if (isStandalone() || readDismissed()) {
      setShowAndroid(false)
      setShowIosCard(false)
      return
    }

    if (isIos()) {
      setShowIosCard(true)
      setShowAndroid(false)
      return
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      const ev = e as Event & { prompt: () => Promise<void> }
      setDeferredPrompt(ev)
      setShowAndroid(true)
    }
    window.addEventListener("beforeinstallprompt", onBip)
    return () => window.removeEventListener("beforeinstallprompt", onBip)
  }, [pathname])

  const dismiss = () => {
    writeDismissed()
    setShowAndroid(false)
    setShowIosCard(false)
    setDeferredPrompt(null)
  }

  const install = async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
    } catch {
      // ignore
    }
    dismiss()
  }

  return (
    <>
      {children}
      {pathname.startsWith("/pay") && showAndroid ? (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-lg border bg-card p-4 shadow-lg md:left-auto">
          <p className="text-sm font-medium">Install counter app</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Add to your home screen for a fullscreen checkout.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={() => void install()} disabled={!deferredPrompt}>
              Install
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
      ) : null}
      {pathname.startsWith("/pay") && showIosCard ? (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-lg border bg-card p-3 text-xs shadow-lg md:left-auto">
          <p className="font-medium text-foreground">Install on iPhone / iPad</p>
          <p className="text-muted-foreground mt-2">
            Tap <span className="text-foreground">Share</span>, then{" "}
            <span className="text-foreground">Add to Home Screen</span>.
          </p>
          <Button type="button" variant="link" className="mt-1 h-auto px-0 text-xs" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </>
  )
}
