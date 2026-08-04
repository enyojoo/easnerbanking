import type { ReactNode } from "react"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.cards.metadata,
  path: "/cards",
})

export default function CardsLayout({ children }: { children: ReactNode }) {
  return children
}
