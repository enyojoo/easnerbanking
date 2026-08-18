import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function PayrollDetailSkeleton({
  sidebar = true,
  rows = 4,
}: {
  sidebar?: boolean
  rows?: number
}) {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading payroll details" aria-busy="true">
      <Skeleton className="h-9 w-36 rounded-lg" />
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-52 max-w-[55vw]" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <Skeleton className="hidden h-10 w-32 rounded-lg sm:block" />
      </div>
      <div className={sidebar ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" : "space-y-6"}>
        <div className="space-y-6">
          <Card className="shadow-soft">
            <CardContent className="space-y-5 p-6">
              <Skeleton className="h-5 w-40" />
              <div className="grid gap-5 sm:grid-cols-2">
                {Array.from({ length: rows }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-5 w-36" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-soft">
            <CardContent className="space-y-4 p-6">
              <Skeleton className="h-5 w-36" />
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-xl" />
              ))}
            </CardContent>
          </Card>
        </div>
        {sidebar ? (
          <div className="space-y-6">
            <Card className="shadow-soft">
              <CardContent className="space-y-4 p-5">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function PayrollFormSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading payroll form" aria-busy="true">
      <Skeleton className="h-9 w-36 rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="shadow-card">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t pt-5">
              <Skeleton className="h-10 w-24 rounded-lg" />
              <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
          </CardContent>
        </Card>
        <Card className="h-fit shadow-soft">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function PayrollInlineRefreshing({ visible }: { visible: boolean }) {
  // Background refreshes deliberately keep cached Payroll content in place.
  // They should not add a floating status element over the business UI.
  void visible
  return null
}

export function PayrollWorkspaceContentSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading Payroll" aria-busy="true">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Skeleton className="h-10 w-full rounded-xl lg:max-w-sm" />
        <Skeleton className="h-10 w-full rounded-xl lg:w-96" />
      </div>
      <Card className="overflow-hidden shadow-soft">
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
