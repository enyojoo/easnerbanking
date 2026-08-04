import type { ReactNode } from "react"
import { authSeo } from "@/lib/seo/content/auth"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: authSeo.join.metadata,
  path: "/auth/join",
})

export default function JoinLayout({ children }: { children: ReactNode }) {
  return children
}
