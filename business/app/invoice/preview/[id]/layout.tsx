import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.invoicePreview.metadata,
  path: "/invoice/preview",
})

export default function InvoicePreviewLayout({ children }: { children: ReactNode }) {
  return children
}
