import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.sendMomoSetup.metadata,
  path: "/send/momo-setup",
})

export default function SendMomoSetupLayout({ children }: { children: ReactNode }) {
  return children
}
