import { PaymentFormSkeleton } from "@/components/checkout/easner-payment-element-checkout"
import { Skeleton } from "@/components/ui/skeleton"

export function PaymentLinkPageSkeleton() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Loading payment">
      <div className="mb-6 flex flex-col items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-lg sm:h-14 sm:w-14" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-48 sm:h-8" />
      </div>
      <div className="mb-6 rounded-xl border bg-muted/30 px-4 py-4 sm:px-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-8 w-32" />
      </div>
      <PaymentFormSkeleton />
    </div>
  )
}
