import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing & FX – Easner Office",
  robots: { index: false, follow: false },
}

export default function PricingFxLayout({ children }: { children: React.ReactNode }) {
  return children
}
