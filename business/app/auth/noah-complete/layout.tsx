import type { ReactNode } from "react"
import { authSeo } from "@/lib/seo/content/auth"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: authSeo.noahComplete.metadata,
  path: "/auth/noah-complete",
})

export default function NoahCompleteLayout({ children }: { children: ReactNode }) {
  return children
}
