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
import { fetchWithSession } from "@/lib/fetch-with-session"

type Props = {
  /** IDs still needed – one field each, or both when neither is on file. */
  missingTypes: NgLocalIdType[]
  className?: string
  onSaved?: () => void
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11)
}

export function NgLocalVerificationNotice({ missingTypes, className, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [nin, setNin] = useState("")
  const [bvn, setBvn] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = NG_LOCAL_VERIFICATION_COPY

  const needNin = missingTypes.includes("NIN")
  const needBvn = missingTypes.includes("BVN")
  const needBoth = needNin && needBvn
  const singleType = !needBoth ? missingTypes[0] : null

  const intro = useMemo(
    () => (needBoth ? copy.introBoth : copy.introOne),
    [needBoth, copy],
  )

  async function save() {
    setError(null)
    if (needBoth) {
      if (!isValidNgLocalIdNumber(nin) || !isValidNgLocalIdNumber(bvn)) {
        setError("Enter an 11-digit NIN and BVN")
        return
      }
    } else if (singleType === "NIN") {
      if (!isValidNgLocalIdNumber(nin)) {
        setError("Enter an 11-digit NIN")
        return
      }
    } else if (singleType === "BVN") {
      if (!isValidNgLocalIdNumber(bvn)) {
        setError("Enter an 11-digit BVN")
        return
      }
    } else {
      return
    }

    setSaving(true)
    try {
      const body = needBoth
        ? { nin: nin.trim(), bvn: bvn.trim() }
        : singleType === "NIN"
          ? { ngLocalIdType: "NIN", ngLocalIdNumber: nin.trim() }
          : { ngLocalIdType: "BVN", ngLocalIdNumber: bvn.trim() }

      const res = await fetchWithSession("/api/compliance/ng-local-verification", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Save failed")
        return
      }
      setOpen(false)
      setNin("")
      setBvn("")
      onSaved?.()
    } catch {
      setError("Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (missingTypes.length === 0) return null

  return (
    <>
      <p className={className ?? "text-sm text-muted-foreground"}>
        {ngSupplementInlinePrompt(missingTypes)}
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
              {intro}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {needNin ? (
              <div className="space-y-2">
                <Label htmlFor="ng-local-nin">{copy.fieldLabelNin}</Label>
                <Input
                  id="ng-local-nin"
                  inputMode="numeric"
                  maxLength={11}
                  value={nin}
                  onChange={(e) => setNin(digitsOnly(e.target.value))}
                  placeholder="00000000000"
                  autoComplete="off"
                />
              </div>
            ) : null}
            {needBvn ? (
              <div className="space-y-2">
                <Label htmlFor="ng-local-bvn">{copy.fieldLabelBvn}</Label>
                <Input
                  id="ng-local-bvn"
                  inputMode="numeric"
                  maxLength={11}
                  value={bvn}
                  onChange={(e) => setBvn(digitsOnly(e.target.value))}
                  placeholder="00000000000"
                  autoComplete="off"
                />
              </div>
            ) : null}
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
