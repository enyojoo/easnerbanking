import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.checkout.metadata,
  path: "/checkout",
})

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children
}
