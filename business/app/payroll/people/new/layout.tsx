import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollPeopleNew.metadata,
  path: "/payroll/people/new",
})

export default function PayrollPeopleNewLayout({ children }: { children: ReactNode }) {
  return children
}
