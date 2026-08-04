import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payCharge.metadata,
  path: "/pay",
})

export default function PayChargeLayout({ children }: { children: ReactNode }) {
  return children
}
