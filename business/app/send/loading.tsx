"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function SendLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-label="Loading send" aria-busy="true">
      <Skeleton className="h-8 w-32" />
      <Card className="shadow-soft">
        <CardContent className="space-y-5 p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </CardContent>
      </Card>
    </div>
  )
}
