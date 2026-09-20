"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { parseConsoleLivemode } from "@/lib/console/livemode"

export function ConsoleModeSwitch() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = parseConsoleLivemode(searchParams.get("livemode"))

  return (
    <Tabs
      value={mode}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString())
        if (next === "live") params.set("livemode", "live")
        else params.delete("livemode")
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname)
      }}
    >
      <TabsList>
        <TabsTrigger value="test">Test</TabsTrigger>
        <TabsTrigger value="live">Live</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
