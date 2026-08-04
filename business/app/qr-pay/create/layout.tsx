import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.qrPayCreate.metadata,
  path: "/qr-pay/create",
})

export default function QrPayCreateLayout({ children }: { children: ReactNode }) {
  return children
}
