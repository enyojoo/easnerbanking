import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Invoice preview",
  description: "Preview how your customer will see this invoice",
}

export default function InvoicePreviewLayout({ children }: { children: React.ReactNode }) {
  return children
}
