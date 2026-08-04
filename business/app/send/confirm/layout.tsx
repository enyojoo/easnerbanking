import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.sendConfirm.metadata,
  path: "/send/confirm",
})

export default function SendConfirmLayout({ children }: { children: ReactNode }) {
  return children
}
