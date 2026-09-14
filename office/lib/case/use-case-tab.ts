"use client"

import { useSearchParams, useRouter, usePathname } from "next/navigation"

export function useOfficeCaseTab(tabIds: string[], fallback: string) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const raw = searchParams.get("tab") || fallback
  const value = tabIds.includes(raw) ? raw : fallback

  function onValueChange(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return { value, onValueChange }
}
