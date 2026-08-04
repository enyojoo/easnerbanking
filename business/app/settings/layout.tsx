import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.settings.metadata,
  path: "/settings",
})

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children
}
