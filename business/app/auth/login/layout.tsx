import type { ReactNode } from "react"
import { authSeo } from "@/lib/seo/content/auth"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: authSeo.login.metadata,
  path: "/auth/login",
})

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children
}
