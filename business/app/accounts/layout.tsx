import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.accounts.metadata,
  path: "/accounts",
})

export default function AccountsLayout({ children }: { children: ReactNode }) {
  return children
}
