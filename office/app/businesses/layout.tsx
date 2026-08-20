import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Businesses – Easner Office",
  robots: { index: false, follow: false },
}

export default function BusinessesLayout({ children }: { children: React.ReactNode }) {
  return children
}
