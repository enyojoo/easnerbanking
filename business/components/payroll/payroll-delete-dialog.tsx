"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

async function runDeleteAndClose(
  onDelete: () => void | Promise<void>,
  onOpenChange: (open: boolean) => void,
) {
  try {
    await onDelete()
    onOpenChange(false)
  } catch {
    // Keep the dialog open so the user can read the error toast and retry or cancel.
  }
}

export function PayrollDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  pending,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  label: string
  pending?: boolean
  onDelete: () => void | Promise<void>
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void runDeleteAndClose(onDelete, onOpenChange)}
          >
            {pending ? "Deleting…" : label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
