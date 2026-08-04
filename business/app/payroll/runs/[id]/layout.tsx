import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollRunDetail.metadata,
  path: "/payroll/runs",
})

export default function PayrollRunDetailLayout({ children }: { children: ReactNode }) {
  return children
}
