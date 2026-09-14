"use client"

import type { ComponentProps } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export type OfficeCaseTab = {
  id: string
  label: string
}

export function OfficeCaseTabBar({
  tabs,
  onTabHover,
}: {
  tabs: OfficeCaseTab[]
  onTabHover?: (id: string) => void
}) {
  return (
    <TabsList className="h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-border/60 bg-transparent p-0 px-4">
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          onPointerEnter={() => onTabHover?.(tab.id)}
          onFocus={() => onTabHover?.(tab.id)}
          className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}

export function OfficeCaseTabPanel({
  className,
  ...props
}: ComponentProps<typeof TabsContent>) {
  return <TabsContent className={cn("mt-0", className)} {...props} />
}

export { Tabs }
