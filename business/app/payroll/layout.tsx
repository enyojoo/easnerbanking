import type { ReactNode } from "react"
import { PayrollWorkspaceShell } from "@/components/payroll/payroll-workspace-shell"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payroll.metadata,
  path: "/payroll",
})

export default function PayrollLayout({ children }: { children: ReactNode }) {
  return <PayrollWorkspaceShell>{children}</PayrollWorkspaceShell>
}
