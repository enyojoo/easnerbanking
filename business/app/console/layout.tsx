import { Suspense, type ReactNode } from "react"
import { ConsoleShell } from "@/components/console/console-shell"
import { appSectionsSeo } from "@/lib/seo/content/app-sections"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: appSectionsSeo.console.metadata,
  path: "/console",
})

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ConsoleShell>{children}</ConsoleShell>
    </Suspense>
  )
}
