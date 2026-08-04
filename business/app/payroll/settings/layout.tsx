import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payrollSettings.metadata,
  path: "/payroll/settings",
})

export default function PayrollSettingsLayout({ children }: { children: ReactNode }) {
  return children
}
