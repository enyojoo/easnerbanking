import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.send.metadata,
  path: "/send",
})

export default function SendLayout({ children }: { children: ReactNode }) {
  return children
}
