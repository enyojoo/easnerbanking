import { Skeleton } from "@/components/ui/skeleton"

export function PaymentLinksListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading payment links">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-lg border p-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CheckoutHubSkeleton() {
  return (
    <div
      className="grid gap-5 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]"
      aria-busy="true"
      aria-label="Loading checkout setup"
    >
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
      <div className="space-y-3 rounded-lg border p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
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
