import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollPersonEdit.metadata,
  path: "/payroll/people",
})

export default function PayrollPersonEditLayout({ children }: { children: ReactNode }) {
  return children
}
