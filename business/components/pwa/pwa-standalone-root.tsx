"use client"

import { useEffect } from "react"
import { isPublicSurfacePath } from "@/lib/surface-paths"

function setStandaloneDataset() {
  if (typeof window === "undefined") return
  const mq = window.matchMedia("(display-mode: standalone)")
  const ios =
    "standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  const standalone = mq.matches || ios
  document.documentElement.dataset.pwaStandalone = standalone ? "true" : "false"
}

export function PwaStandaloneRoot() {
  useEffect(() => {
    setStandaloneDataset()
    const mq = window.matchMedia("(display-mode: standalone)")
    const onChange = () => setStandaloneDataset()
    mq.addEventListener("change", onChange)

    if (process.env.NODE_ENV !== "production") {
      return () => mq.removeEventListener("change", onChange)
    }

    // Public customer invoice views should not be controlled by a SW — avoids
    // console noise and unnecessary interception on unauthenticated pay pages.
    const path = window.location.pathname
    const isPublicCustomer = isPublicSurfacePath(path, window.location.hostname)
    if ("serviceWorker" in navigator) {
      if (isPublicCustomer) {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const reg of regs) {
            void reg.unregister()
          }
        })
      } else {
        void navigator.serviceWorker.register("/sw.js").catch(() => {
          // ignore
        })
      }
    }

    return () => mq.removeEventListener("change", onChange)
  }, [])

  return null
}
