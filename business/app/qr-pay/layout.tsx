import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "QR Pay | Easner Business Banking",
}

export default function QrPayLayout({ children }: { children: ReactNode }) {
  return children
}
