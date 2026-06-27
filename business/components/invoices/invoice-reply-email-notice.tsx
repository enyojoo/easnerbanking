import Link from "next/link"
import type { InvoiceReplyEmailSource } from "@/lib/invoices/invoice-reply-email"

export function invoiceReplyEmailSourceLabel(source: InvoiceReplyEmailSource): string {
  switch (source) {
    case "support":
      return "support email"
    case "owner":
      return "account owner email"
    case "sender":
      return "your account email"
  }
}

type InvoiceReplyEmailNoticeProps = {
  email: string | null | undefined
  source: InvoiceReplyEmailSource | null | undefined
  /** When editing support email in Settings, preview typed value before save. */
  draftSupportEmail?: string
  variant: "settings" | "invoices"
}

export function resolveInvoiceReplyEmailNotice(input: {
  email: string | null | undefined
  source: InvoiceReplyEmailSource | null | undefined
  draftSupportEmail?: string
}): { email: string; source: InvoiceReplyEmailSource } | null {
  const draft = input.draftSupportEmail?.trim()
  if (draft) return { email: draft, source: "support" }
  if (input.email?.trim() && input.source) {
    return { email: input.email.trim(), source: input.source }
  }
  return null
}

export function InvoiceReplyEmailNotice({
  email,
  source,
  draftSupportEmail,
  variant,
}: InvoiceReplyEmailNoticeProps) {
  const resolved = resolveInvoiceReplyEmailNotice({ email, source, draftSupportEmail })
  if (!resolved) return null

  const settingsHref = "/settings?tab=business"

  if (resolved.source === "support") {
    return (
      <p
        className={
          variant === "settings"
            ? "text-sm text-emerald-700 dark:text-emerald-400"
            : "text-sm text-muted-foreground"
        }
      >
        Customer invoice replies go to{" "}
        <span className="font-medium text-foreground">{resolved.email}</span>.
      </p>
    )
  }

  const fallbackLabel = invoiceReplyEmailSourceLabel(resolved.source)

  if (variant === "settings") {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-200/90">
        Add a support email above so invoice replies go to your billing inbox. Until then, replies
        go to{" "}
        <span className="font-medium">{resolved.email}</span> ({fallbackLabel}).
      </p>
    )
  }

  return (
    <p className="text-sm text-amber-800 dark:text-amber-200/90 rounded-lg border border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2">
      Invoice customer replies go to{" "}
      <span className="font-medium">{resolved.email}</span> ({fallbackLabel}).{" "}
      <Link href={settingsHref} className="underline font-medium hover:text-amber-950 dark:hover:text-amber-100">
        Add a support email
      </Link>{" "}
      in Settings → Business for your billing inbox.
    </p>
  )
}
