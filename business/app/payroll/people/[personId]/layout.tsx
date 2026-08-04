import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollPersonDetail.metadata,
  path: "/payroll/people",
})

export default function PayrollPersonDetailLayout({ children }: { children: ReactNode }) {
  return children
}
