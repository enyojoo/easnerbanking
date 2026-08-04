import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollPeopleImport.metadata,
  path: "/payroll/people/import",
})

export default function PayrollPeopleImportLayout({ children }: { children: ReactNode }) {
  return children
}
