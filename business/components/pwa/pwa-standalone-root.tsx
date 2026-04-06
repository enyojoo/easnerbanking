"use client"

import { useEffect } from "react"

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

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // ignore
      })
    }

    return () => mq.removeEventListener("change", onChange)
  }, [])

  return null
}
