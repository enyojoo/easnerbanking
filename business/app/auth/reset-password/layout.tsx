import type { ReactNode } from "react"
import { authSeo } from "@/lib/seo/content/auth"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: authSeo.resetPassword.metadata,
  path: "/auth/reset-password",
})

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children
}
