import type { Metadata } from "next"
import { NoahReturnView } from "@/components/auth/noah-return-view"

export const metadata: Metadata = {
  title: "Verification complete | Easner Business",
  description: "Return from Easner hosted identity verification",
}

export default function NoahKycReturnPage() {
  return <NoahReturnView variant="kyc" />
}
