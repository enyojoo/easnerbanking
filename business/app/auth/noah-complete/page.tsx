import type { Metadata } from "next"
import { NoahCompleteView } from "@/components/auth/noah-complete-view"

export const metadata: Metadata = {
  title: "Verification complete | Easner",
  description: "Hosted verification finished",
  robots: { index: false, follow: false },
}

export default function NoahCompletePage() {
  return <NoahCompleteView />
}
