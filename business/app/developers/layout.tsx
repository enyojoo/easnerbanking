import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.developers.metadata,
  path: "/developers",
})

export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return children
}
