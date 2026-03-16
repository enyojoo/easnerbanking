import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "AML Policy",
}

export default function AMLPolicyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
