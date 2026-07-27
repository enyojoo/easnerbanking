"use client"

import Link from "next/link"
import {
  CalendarX2,
  Copy,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Redo2,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PayrollRunAction } from "@/lib/payroll/run-actions"

const LABELS: Record<PayrollRunAction, string> = {
  edit: "Edit run",
  duplicate: "Duplicate run",
  submit: "Submit for approval",
  approve: "Review and approve",
  reject: "Reject",
  return_to_draft: "Return to draft",
  execute: "Review and execute",
  cancel: "Cancel schedule",
  retry: "Retry failed payments",
  create_correction: "Create corrected run",
  delete: "Delete run",
  download_pay_stubs: "Download pay stubs",
  view_progress: "View sending progress",
}

function ActionIcon({ action }: { action: PayrollRunAction }) {
  if (action === "edit") return <Pencil />
  if (action === "duplicate") return <Copy />
  if (action === "submit" || action === "approve" || action === "execute") return <Send />
  if (action === "reject") return <XCircle />
  if (action === "return_to_draft") return <Undo2 />
  if (action === "cancel") return <CalendarX2 />
  if (action === "retry") return <RotateCcw />
  if (action === "create_correction") return <Redo2 />
  if (action === "delete") return <Trash2 />
  if (action === "download_pay_stubs") return <Download />
  return <Eye />
}

export function PayrollRunActionsMenu({
  runId,
  runName,
  actions,
  detailHref,
  returnTo = "/payroll/runs",
  showView = false,
  disabledActions,
  interceptActions,
  onAction,
}: {
  runId: string
  runName: string
  actions: PayrollRunAction[]
  detailHref: string
  returnTo?: string
  showView?: boolean
  disabledActions?: Partial<Record<PayrollRunAction, boolean>>
  interceptActions?: PayrollRunAction[]
  onAction: (action: PayrollRunAction) => void
}) {
  const directHref = (action: PayrollRunAction): string | null => {
    if (interceptActions?.includes(action)) return null
    if (action === "edit") {
      return `/payroll/runs/new?edit=${encodeURIComponent(runId)}&returnTo=${encodeURIComponent(returnTo)}`
    }
    if (action === "duplicate") {
      return `/payroll/runs/new?copyFrom=${encodeURIComponent(runId)}&copyMode=duplicate&returnTo=${encodeURIComponent(returnTo)}`
    }
    if (action === "create_correction") {
      return `/payroll/runs/new?copyFrom=${encodeURIComponent(runId)}&copyMode=correction&returnTo=${encodeURIComponent(returnTo)}`
    }
    if (action === "download_pay_stubs") {
      return `/api/business/payroll/runs/${encodeURIComponent(runId)}/documents/export`
    }
    return null
  }
  const destructive = actions.filter((action) => action === "delete")
  const regular = actions.filter(
    (action) => action !== "delete" && !(showView && action === "view_progress"),
  )

  function item(action: PayrollRunAction) {
    const href = directHref(action)
    const content = (
      <>
        <ActionIcon action={action} />
        {LABELS[action]}
      </>
    )
    if (href) {
      return (
        <DropdownMenuItem key={action} asChild disabled={disabledActions?.[action]}>
          <Link href={href}>{content}</Link>
        </DropdownMenuItem>
      )
    }
    return (
      <DropdownMenuItem
        key={action}
        variant={action === "cancel" ? "destructive" : undefined}
        disabled={disabledActions?.[action]}
        onClick={() => onAction(action)}
      >
        {content}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="min-h-11 min-w-11"
          aria-label={`Actions for ${runName}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {showView ? (
          <DropdownMenuItem asChild>
            <Link href={detailHref}>
              <Eye />
              {actions.includes("view_progress") ? "View sending progress" : "View details"}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {showView && regular.length ? <DropdownMenuSeparator /> : null}
        {regular.map(item)}
        {destructive.length ? <DropdownMenuSeparator /> : null}
        {destructive.map((action) => (
          <DropdownMenuItem
            key={action}
            variant="destructive"
            disabled={disabledActions?.[action]}
            onClick={() => onAction(action)}
          >
            <ActionIcon action={action} />
            {LABELS[action]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
