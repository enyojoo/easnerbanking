import type { ReactNode } from "react"
import { authSeo } from "@/lib/seo/content/auth"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: authSeo.forgotPassword.metadata,
  path: "/auth/forgot-password",
})

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children
}
