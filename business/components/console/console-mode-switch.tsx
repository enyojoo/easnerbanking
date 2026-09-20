"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import type { ConsoleLivemode } from "@/lib/console/livemode"

export function ConsoleModeSwitch() {
  const { livemode, setLivemode } = useConsoleLivemode()

  return (
    <Tabs value={livemode} onValueChange={(next) => setLivemode(next as ConsoleLivemode)}>
      <TabsList>
        <TabsTrigger value="test">Test</TabsTrigger>
        <TabsTrigger value="live">Live</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
