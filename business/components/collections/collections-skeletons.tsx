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
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading checkout setup">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-6 rounded-3xl border p-6 sm:p-8">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-9 w-36" />
      </div>
    </div>
  )
}

export function CheckoutTestPaymentsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading test payments">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex gap-4 border-b py-2.5 last:border-0">
          <Skeleton className="h-4 w-[28%]" />
          <Skeleton className="h-4 w-[16%]" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-[18%]" />
        </div>
      ))}
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
    <div
      className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3 sm:p-4"
      aria-busy="true"
      aria-label="Loading payout account"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-6 w-24" />
    </div>
  )
}
