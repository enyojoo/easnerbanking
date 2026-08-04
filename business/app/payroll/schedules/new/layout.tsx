import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollSchedulesNew.metadata,
  path: "/payroll/schedules/new",
})

export default function PayrollSchedulesNewLayout({ children }: { children: ReactNode }) {
  return children
}
