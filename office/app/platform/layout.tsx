import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Platform — Easner Office",
  robots: { index: false, follow: false },
}

export default function PlatformLensLayout({ children }: { children: React.ReactNode }) {
  return children
}
