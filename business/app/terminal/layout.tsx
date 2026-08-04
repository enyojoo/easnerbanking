import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.terminal.metadata,
  path: "/terminal",
})

export default function TerminalLayout({ children }: { children: ReactNode }) {
  return children
}
