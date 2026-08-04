import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.payAsset.metadata,
  path: "/pay/asset",
})

export default function PayAssetLayout({ children }: { children: ReactNode }) {
  return children
}
