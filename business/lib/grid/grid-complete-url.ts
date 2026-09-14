import { isHostedOnboardingCompleteUrl } from "@/lib/auth/hosted-onboarding-complete"

/** True when href is our hosted KYB/KYC return page. */
export function isGridCompleteUrl(href: string): boolean {
  return isHostedOnboardingCompleteUrl(href)
}
