import { PaymentFormSkeleton } from "@/components/checkout/easner-payment-element-checkout"
import { Skeleton } from "@/components/ui/skeleton"

export function InvoiceCustomerPageSkeleton() {
  return (
    <div className="w-full max-w-2xl" aria-busy="true" aria-label="Loading invoice">
      <div className="rounded-xl border bg-card p-4 sm:p-6 lg:p-8">
        <div className="mb-8 grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Skeleton className="h-12 w-12 rounded-lg sm:h-14 sm:w-14" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex flex-col items-end space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
        <div className="mb-8 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="mb-8 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
        <PaymentFormSkeleton />
      </div>
    </div>
  )
}
