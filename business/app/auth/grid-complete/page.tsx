import type { Metadata } from "next"
import { GridCompleteView } from "@/components/auth/grid-complete-view"

export const metadata: Metadata = {
  title: "Verification complete | Easner",
  description: "Hosted verification finished",
  robots: { index: false, follow: false },
}

export default function GridCompletePage() {
  return <GridCompleteView />
}
