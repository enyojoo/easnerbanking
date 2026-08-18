import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

export function CheckoutSetupShell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Link
          href="/checkout"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {COLLECTIONS_COPY.setupBack}
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      </div>
      {children}
    </div>
  )
}
