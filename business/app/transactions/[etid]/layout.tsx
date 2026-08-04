import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.transactionDetail.metadata,
  path: "/transactions",
})

export default function TransactionDetailLayout({ children }: { children: ReactNode }) {
  return children
}
