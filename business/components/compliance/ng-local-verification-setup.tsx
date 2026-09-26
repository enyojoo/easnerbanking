"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  NG_LOCAL_VERIFICATION_COPY,
  resolveNgLocalVerification,
  type NgLocalIdType,
} from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { NgLocalVerificationFields } from "@/components/compliance/ng-local-verification-fields"
import { toast } from "sonner"

type Props = {
  onClose: () => void
}

export function NgLocalVerificationSetup({ onClose }: Props) {
  const [missingTypes, setMissingTypes] = useState<NgLocalIdType[]>(["NIN", "BVN"])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithSession("/api/compliance/ng-local-verification")
      const data = (await res.json().catch(() => ({}))) as {
        residenceCountry?: string | null
        kycIdType?: string | null
        kycIdNumber?: string | null
        ngLocalIdType?: string | null
        ngLocalIdNumber?: string | null
      }
      if (!res.ok) {
        toast.error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : "Could not load verification")
        return
      }
      const state = resolveNgLocalVerification({
        residenceCountry: data.residenceCountry,
        kycIdType: data.kycIdType,
        kycIdNumber: data.kycIdNumber,
        ngLocalIdType: data.ngLocalIdType,
        ngLocalIdNumber: data.ngLocalIdNumber,
      })
      if (state.complete) {
        onClose()
        return
      }
      setMissingTypes(state.missingTypes.length ? state.missingTypes : ["NIN", "BVN"])
    } catch {
      toast.error("Could not load verification")
    } finally {
      setLoading(false)
    }
  }, [onClose])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <div className="space-y-3">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit gap-2" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h1 className="text-xl font-semibold">{NG_LOCAL_VERIFICATION_COPY.title}</h1>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <NgLocalVerificationFields
          missingTypes={missingTypes}
          idPrefix="ng-local-setup"
          onSaved={() => {
            toast.success(NG_LOCAL_VERIFICATION_COPY.verified)
            onClose()
          }}
        />
      )}
    </div>
  )
}
