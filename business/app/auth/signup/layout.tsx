import type { ReactNode } from "react"
import { authSeo } from "@/lib/seo/content/auth"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: authSeo.signup.metadata,
  path: "/auth/signup",
})

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children
}
