import { Skeleton } from "@/components/ui/skeleton"

export function PaymentLinksListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading payment links">
      <div className="border-b px-4 py-3">
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex gap-4 border-b px-4 py-4 last:border-0">
          <Skeleton className="h-4 w-[28%]" />
          <Skeleton className="h-4 w-[16%]" />
          <Skeleton className="h-4 w-[16%]" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  )
}

export function CheckoutHubSkeleton() {
  return (
    <div
      className="grid gap-8 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]"
      aria-busy="true"
      aria-label="Loading checkout setup"
    >
      <div className="hidden space-y-2 lg:block">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
      <div className="space-y-6 rounded-lg border p-6 sm:p-8">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}

export function CheckoutSitesTableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading websites">
      <div className="border-b px-4 py-3">
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex gap-4 border-b px-4 py-4 last:border-0">
          <Skeleton className="h-4 w-[28%]" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  )
}

export function PaymentsSettingsPanelSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading payments settings">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  )
}

export function PaymentsPayoutSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading payout details">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}
