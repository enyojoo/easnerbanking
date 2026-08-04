import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.invoicesImport.metadata,
  path: "/invoices/import",
})

export default function InvoicesImportLayout({ children }: { children: ReactNode }) {
  return children
}
