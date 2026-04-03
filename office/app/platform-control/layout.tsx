import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Platform control — Easner Office",
  robots: { index: false, follow: false },
}

export default function PlatformControlLayout({ children }: { children: React.ReactNode }) {
  return children
}
