import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.qrPay.metadata,
  path: "/qr-pay",
})

export default function QrPayLayout({ children }: { children: ReactNode }) {
  return children
}
