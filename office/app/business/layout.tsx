import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Business — Easner Office",
  robots: { index: false, follow: false },
}

export default function BusinessLensLayout({ children }: { children: React.ReactNode }) {
  return children
}
