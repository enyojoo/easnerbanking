"use client"

import { useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  NG_LOCAL_VERIFICATION_COPY,
  isValidNgLocalIdNumber,
  ngSupplementInlinePrompt,
  type NgLocalIdType,
} from "@easner/shared"

type Props = {
  missingType: NgLocalIdType
  className?: string
  onSaved?: () => void
}

export function NgLocalVerificationNotice({ missingType, className, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = NG_LOCAL_VERIFICATION_COPY

  const fieldLabel = useMemo(
    () => (missingType === "NIN" ? copy.fieldLabelNin : copy.fieldLabelBvn),
    [missingType, copy],
  )

  async function save() {
    setError(null)
    if (!isValidNgLocalIdNumber(value)) {
      setError("Enter an 11-digit number")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/compliance/ng-local-verification", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ngLocalIdType: missingType, ngLocalIdNumber: value.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Save failed")
        return
      }
      setOpen(false)
      setValue("")
      onSaved?.()
    } catch {
      setError("Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <p className={className ?? "text-sm text-muted-foreground"}>
        {ngSupplementInlinePrompt(missingType)}
        <button
          type="button"
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setOpen(true)}
        >
          {copy.inlineLink}
        </button>
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed text-foreground/90 pt-2">
              {copy.introBoth}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="ng-local-id">{fieldLabel}</Label>
              <Input
                id="ng-local-id"
                inputMode="numeric"
                maxLength={11}
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="00000000000"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
