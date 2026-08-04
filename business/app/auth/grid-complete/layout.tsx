import type { ReactNode } from "react"
import { authSeo } from "@/lib/seo/content/auth"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: authSeo.gridComplete.metadata,
  path: "/auth/grid-complete",
})

export default function GridCompleteLayout({ children }: { children: ReactNode }) {
  return children
}
