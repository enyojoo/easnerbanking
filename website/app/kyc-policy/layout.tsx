import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "KYC Policy",
}

export default function KYCPolicyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
