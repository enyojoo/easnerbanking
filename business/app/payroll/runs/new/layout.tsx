import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollRunsNew.metadata,
  path: "/payroll/runs/new",
})

export default function PayrollRunsNewLayout({ children }: { children: ReactNode }) {
  return children
}
