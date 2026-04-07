const ONBOARDING_KEY = "business_onboarding"

export interface OnboardingData {
  countryCode: string
  businessName?: string
  /** Data URL or remote URL for the business logo */
  businessLogo?: string | null
  businessType?: string
  baseCurrency?: string
  businessDescription?: string
  /** Set to false at signup; true after onboarding dialog is completed or skipped */
  businessOnboardingComplete?: boolean
}

export function getOnboarding(): OnboardingData | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Replaces stored onboarding (use mergeOnboarding for partial updates). */
export function setOnboarding(data: OnboardingData) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(data))
    window.dispatchEvent(new Event("business-profile-updated"))
  } catch (e) {
    console.error("Failed to save onboarding:", e)
  }
}

/** Merges into existing onboarding and notifies listeners (header, nav). */
export function mergeOnboarding(data: Partial<OnboardingData>) {
  if (typeof window === "undefined") return
  try {
    const prev = getOnboarding()
    const next: OnboardingData = {
      countryCode: data.countryCode ?? prev?.countryCode ?? "",
      businessName: data.businessName !== undefined ? data.businessName : prev?.businessName,
      businessLogo: data.businessLogo !== undefined ? data.businessLogo : prev?.businessLogo,
      businessType: data.businessType !== undefined ? data.businessType : prev?.businessType,
      baseCurrency: data.baseCurrency !== undefined ? data.baseCurrency : prev?.baseCurrency,
      businessDescription:
        data.businessDescription !== undefined ? data.businessDescription : prev?.businessDescription,
      businessOnboardingComplete:
        data.businessOnboardingComplete !== undefined
          ? data.businessOnboardingComplete
          : prev?.businessOnboardingComplete,
    }
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event("business-profile-updated"))
  } catch (e) {
    console.error("Failed to save onboarding:", e)
  }
}
