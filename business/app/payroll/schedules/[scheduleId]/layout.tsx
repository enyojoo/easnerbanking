import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollScheduleDetail.metadata,
  path: "/payroll/schedules",
})

export default function PayrollScheduleDetailLayout({ children }: { children: ReactNode }) {
  return children
}
