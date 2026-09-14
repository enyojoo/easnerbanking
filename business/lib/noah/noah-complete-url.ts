import { isHostedOnboardingCompleteUrl } from "@/lib/auth/hosted-onboarding-complete"

/** True when hosted onboarding navigated to our completion ReturnURL. */
export function isNoahCompleteUrl(url: string): boolean {
  return isHostedOnboardingCompleteUrl(url)
}
