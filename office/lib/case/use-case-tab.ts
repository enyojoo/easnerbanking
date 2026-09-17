"use client"

import { useEffect, useState } from "react"
import { useSearchParams, usePathname } from "next/navigation"

export function useOfficeCaseTab(tabIds: string[], fallback: string) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const raw = searchParams.get("tab") || fallback
  const urlTab = tabIds.includes(raw) ? raw : fallback
  const [activeTab, setActiveTab] = useState(urlTab)

  useEffect(() => {
    setActiveTab(urlTab)
  }, [urlTab])

  function onValueChange(next: string) {
    if (!tabIds.includes(next) || next === activeTab) return
    setActiveTab(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", next)
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`)
  }

  return {
    value: tabIds.includes(activeTab) ? activeTab : fallback,
    onValueChange,
  }
}
