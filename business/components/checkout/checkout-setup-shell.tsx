import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

export function CheckoutSetupShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/checkout"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {COLLECTIONS_COPY.setupBack}
      </Link>
      {children}
    </div>
  )
}
