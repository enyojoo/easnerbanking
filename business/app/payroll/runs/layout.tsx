import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollRuns.metadata,
  path: "/payroll/runs",
})

export default function PayrollRunsLayout({ children }: { children: ReactNode }) {
  return children
}
