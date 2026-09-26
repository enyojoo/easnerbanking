"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  NG_LOCAL_VERIFICATION_COPY,
  isValidNgLocalIdNumber,
  type NgLocalIdType,
} from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11)
}

type Props = {
  missingTypes: NgLocalIdType[]
  onSaved?: () => void
  /** Optional id prefix so hub + deposit dialog inputs stay unique. */
  idPrefix?: string
  submitLabel?: string
}

export function NgLocalVerificationFields({
  missingTypes,
  onSaved,
  idPrefix = "ng-local",
  submitLabel,
}: Props) {
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
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>
      <div className="space-y-3">
        {needNin ? (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-nin`}>{copy.fieldLabelNin}</Label>
            <Input
              id={`${idPrefix}-nin`}
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
            <Label htmlFor={`${idPrefix}-bvn`}>{copy.fieldLabelBvn}</Label>
            <Input
              id={`${idPrefix}-bvn`}
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
      <Button type="button" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : submitLabel ?? copy.save}
      </Button>
    </div>
  )
}
