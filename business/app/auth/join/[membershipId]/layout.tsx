import type { ReactNode } from "react"
import { authSeo } from "@/lib/seo/content/auth"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: authSeo.joinInvite.metadata,
  path: "/auth/join",
})

export default function JoinInviteLayout({ children }: { children: ReactNode }) {
  return children
}
