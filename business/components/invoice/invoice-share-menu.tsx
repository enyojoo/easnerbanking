"use client"

import Link from "next/link"
import { Copy, ExternalLink, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Invoice } from "@/lib/b2b/types"
import {
  INVOICE_ACTION_COPY,
  INVOICE_SHARE_COPY,
  INVOICE_TOAST_COPY,
} from "@/lib/copy/business-ui-copy"
import {
  buildInvoiceCustomerUrl,
  buildInvoicePreviewUrl,
  invoicePreviewPath,
} from "@/lib/invoice-public-url"
import { isInvoiceCustomerLinkShareable } from "@/lib/invoices/invoice-status"
import { invoiceActionBtnClass } from "@/lib/invoices/invoice-action-button-classes"

type Props = {
  invoice: Pick<Invoice, "id" | "invoiceNumber" | "status">
  easetag: string | null | undefined
  /** When true, render as a compact icon button (list rows). */
  compact?: boolean
  /** Stop click propagation (list table rows). */
  stopPropagation?: boolean
  className?: string
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.left = "-9999px"
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand("copy")
    document.body.removeChild(textArea)
    return true
  } catch {
    return false
  }
}

export function InvoiceShareMenu({
  invoice,
  easetag,
  compact = false,
  stopPropagation = false,
  className,
}: Props) {
  const canShareCustomer = isInvoiceCustomerLinkShareable(invoice.status)
  const previewHref = invoicePreviewPath(invoice.id)

  const onCopyCustomer = async (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation()
    if (!canShareCustomer) return
    const url = buildInvoiceCustomerUrl(easetag, invoice)
    const ok = await copyText(url)
    if (ok) toast.success(INVOICE_TOAST_COPY.customerLinkCopied)
    else toast.error("Could not copy link")
  }

  const onCopyPreview = async (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation()
    const url = buildInvoicePreviewUrl(window.location.origin, invoice.id)
    const ok = await copyText(url)
    if (ok) toast.success(INVOICE_TOAST_COPY.previewLinkCopied)
    else toast.error("Could not copy link")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          className={className ?? (compact ? undefined : invoiceActionBtnClass.outline)}
          onClick={(e) => {
            if (stopPropagation) e.stopPropagation()
          }}
          aria-label={INVOICE_ACTION_COPY.share}
        >
          <Share2 className={compact ? "h-4 w-4" : "h-4 w-4 mr-2"} />
          {compact ? null : INVOICE_ACTION_COPY.share}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation()
        }}
      >
        {canShareCustomer ? (
          <DropdownMenuItem onClick={(e) => void onCopyCustomer(e)}>
            <Copy className="h-4 w-4 mr-2" />
            {INVOICE_ACTION_COPY.copyCustomerLink}
          </DropdownMenuItem>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenuItem disabled className="opacity-50">
                    <Copy className="h-4 w-4 mr-2" />
                    {INVOICE_ACTION_COPY.copyCustomerLink}
                  </DropdownMenuItem>
                </div>
              </TooltipTrigger>
              <TooltipContent>{INVOICE_SHARE_COPY.customerLinkDisabledDraft}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <DropdownMenuItem onClick={(e) => void onCopyPreview(e)}>
          <Copy className="h-4 w-4 mr-2" />
          {INVOICE_ACTION_COPY.copyPreviewLink}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={previewHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            {INVOICE_ACTION_COPY.openPreview}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
