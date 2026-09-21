"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

function jumpPath(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith("cus_")) return `/customers/${value}`
  if (value.startsWith("acct_")) return `/accounts?id=${encodeURIComponent(value)}`
  if (value.startsWith("txn_")) return `/transactions?id=${encodeURIComponent(value)}`
  if (value.startsWith("tr_")) return `/transactions?id=${encodeURIComponent(value)}`
  if (value.startsWith("dest_")) return `/customers?q=${encodeURIComponent(value)}`
  if (value.startsWith("cs_")) return `/checkout?session=${encodeURIComponent(value)}`
  if (/^[0-9a-f-]{16,}$/i.test(value)) return `/console/logs?id=${encodeURIComponent(value)}`
  return null
}

export function ConsoleJumpTo() {
  const router = useRouter()
  const [value, setValue] = useState("")

  const go = () => {
    const href = jumpPath(value)
    if (!href) return
    router.push(href)
    setValue("")
  }

  return (
    <div className="relative hidden min-w-[12rem] max-w-xs flex-1 md:block">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go()
        }}
        placeholder="Jump to cus_, acct_, txn_…"
        className="h-8 pl-8 text-xs"
        aria-label="Jump to object id"
      />
    </div>
  )
}
