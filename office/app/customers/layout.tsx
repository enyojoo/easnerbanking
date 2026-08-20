import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Customers – Easner Office",
  robots: { index: false, follow: false },
}

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  return children
}
