import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terminal – Easner Office",
  robots: { index: false, follow: false },
}

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return children
}
