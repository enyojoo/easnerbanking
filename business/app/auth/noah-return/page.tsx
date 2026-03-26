import type { Metadata } from "next"
import { NoahReturnView } from "@/components/auth/noah-return-view"

/** Use when `NOAH_BUSINESS_ONBOARDING_RETURN_URL` is unset and both flows share one ReturnURL. */
export const metadata: Metadata = {
  title: "Verification complete | Easner Business",
  description: "Return from Noah hosted verification",
}

export default function NoahReturnPage() {
  return <NoahReturnView variant="kyc" />
}
