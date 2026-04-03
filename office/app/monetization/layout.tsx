import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Monetization — Easner Office",
  robots: { index: false, follow: false },
}

export default function MonetizationLayout({ children }: { children: React.ReactNode }) {
  return children
}
