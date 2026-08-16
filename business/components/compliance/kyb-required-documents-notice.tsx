"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { KYB_REQUIRED_DOCUMENTS_DIALOG } from "@/lib/compliance/kyb-required-documents"

type Props = {
  className?: string
}

export function KybRequiredDocumentsNotice({ className }: Props) {
  const [open, setOpen] = useState(false)
  const copy = KYB_REQUIRED_DOCUMENTS_DIALOG

  return (
    <>
      <p className={className ?? "text-sm text-muted-foreground"}>
        {copy.inlinePrompt}
        <button
          type="button"
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setOpen(true)}
        >
          {copy.inlineLink}
        </button>
        {copy.inlineSuffix}
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(90vh,36rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed text-foreground/90 pt-2">
              {copy.intro}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-foreground/90">
            <div>
              <p className="font-medium">Company documents</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {copy.companyDocuments.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">{copy.ownersHeading}</p>
              <p className="mt-2 leading-relaxed">{copy.ownersBody}</p>
            </div>
            <p className="text-muted-foreground">{copy.closing}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
