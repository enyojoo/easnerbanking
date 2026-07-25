import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { OfficePageSkeleton } from "@/components/data/office-page-skeleton"

export function OfficeRouteLoading() {
  return (
    <OfficeDashboardLayout>
      <OfficePageSkeleton />
    </OfficeDashboardLayout>
  )
}
