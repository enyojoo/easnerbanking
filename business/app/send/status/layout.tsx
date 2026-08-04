import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.sendStatus.metadata,
  path: "/send/status",
})

export default function SendStatusLayout({ children }: { children: ReactNode }) {
  return children
}
