import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.invoicesCreate.metadata,
  path: "/invoices/create",
})

export default function InvoicesCreateLayout({ children }: { children: ReactNode }) {
  return children
}
