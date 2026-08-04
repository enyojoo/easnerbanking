import type { ReactNode } from "react"
import { PayLayoutShell } from "@/components/pay/pay-layout-shell"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.pay.metadata,
  path: "/pay",
})

export default function PayLayout({ children }: { children: ReactNode }) {
  return <PayLayoutShell>{children}</PayLayoutShell>
}
