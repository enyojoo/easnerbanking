import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.invoiceDetail.metadata,
  path: "/invoices",
})

export default function InvoiceDetailLayout({ children }: { children: ReactNode }) {
  return children
}
