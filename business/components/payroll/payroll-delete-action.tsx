"use client"

import { Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"

export function PayrollDeleteAction({
  label,
  title,
  description,
  pending,
  onDelete,
}: {
  label: string
  title: string
  description: string
  pending?: boolean
  onDelete: () => void | Promise<void>
}) {
  return <AlertDialog>
    <AlertDialogTrigger asChild><Button variant="outline"><Trash2 className="mr-2 h-4 w-4" />{label}</Button></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
        <AlertDialogAction className={buttonVariants({ variant: "destructive" })} disabled={pending} onClick={() => void onDelete()}>{pending ? "Deleting…" : label}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
