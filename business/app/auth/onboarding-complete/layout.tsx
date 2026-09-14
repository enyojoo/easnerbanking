import type { ReactNode } from "react"
import { authSeo } from "@/lib/seo/content/auth"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: authSeo.onboardingComplete.metadata,
  path: "/auth/onboarding-complete",
})

export default function OnboardingCompleteLayout({ children }: { children: ReactNode }) {
  return children
}
