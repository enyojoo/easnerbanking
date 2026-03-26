import type { Metadata } from "next"
import { NoahReturnView } from "@/components/auth/noah-return-view"

export const metadata: Metadata = {
  title: "Business verification complete | Easner Business",
  description: "Return from Noah hosted business verification",
}

export default function NoahKybReturnPage() {
  return <NoahReturnView variant="kyb" />
}
