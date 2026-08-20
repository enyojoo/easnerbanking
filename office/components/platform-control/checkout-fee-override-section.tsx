"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Edit, Loader2, Save, X } from "lucide-react"
import {
  CHECKOUT_FEE_MODE_HINTS,
  CHECKOUT_FEE_MODE_LABELS,
  checkoutFeeOverrideApi,
  type CheckoutFeeMode,
  type CheckoutFeeOverrideState,
} from "@/lib/checkout-fee-override-api"

const BUSINESS_CHOICE = "business_choice"

/**
 * Checkout processing fee policy for online collections (invoice Pay online, payment
 * links, website checkout). Setting a mode here overrides the business's own choice.
 */
export function CheckoutFeeOverrideSection({ businessId }: { businessId: string }) {
  const [state, setState] = useState<CheckoutFeeOverrideState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [selection, setSelection] = useState<string>(BUSINESS_CHOICE)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await checkoutFeeOverrideApi.get(businessId)
      setState(next)
      setSelection(next.overrideFeeMode ?? BUSINESS_CHOICE)
      setReason(next.overrideReason ?? "")
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load checkout fee policy")
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      if (selection === BUSINESS_CHOICE) {
        await checkoutFeeOverrideApi.clear(businessId)
      } else {
        await checkoutFeeOverrideApi.set(
          businessId,
          selection as CheckoutFeeMode,
          reason.trim() || null,
        )
      }
      await load()
      setIsEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save checkout fee policy")
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setSelection(state?.overrideFeeMode ?? BUSINESS_CHOICE)
    setReason(state?.overrideReason ?? "")
    setError(null)
    setIsEditing(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Checkout processing fees</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Who pays card and bank processing on this business&apos;s online collections. An
              override here replaces the choice they made in their own checkout settings.
            </p>
          </div>
          {!loading && !loadError && !isEditing ? (
            <Button
              type="button"
              className="shrink-0 bg-primary hover:bg-primary/90"
              onClick={() => setIsEditing(true)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit policy
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : loadError || !state ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {loadError}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`checkout-fee-mode-${businessId}`}>Fee policy</Label>
                <Select
                  value={selection}
                  onValueChange={(value) => {
                    setSelection(value)
                    setError(null)
                  }}
                  disabled={!isEditing}
                >
                  <SelectTrigger id={`checkout-fee-mode-${businessId}`} className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BUSINESS_CHOICE}>
                      Business choice
                      {state.businessFeeMode
                        ? ` (${CHECKOUT_FEE_MODE_LABELS[state.businessFeeMode]})`
                        : " (Merchant net)"}
                    </SelectItem>
                    {state.availableModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {CHECKOUT_FEE_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selection === BUSINESS_CHOICE
                    ? "The business picks between merchant net and buyer surcharge on their Online Checkout page."
                    : CHECKOUT_FEE_MODE_HINTS[selection as CheckoutFeeMode]}
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`checkout-fee-reason-${businessId}`}>Reason</Label>
                <Input
                  id={`checkout-fee-reason-${businessId}`}
                  placeholder={
                    selection === BUSINESS_CHOICE ? "–" : "Optional note for ops / audit"
                  }
                  value={selection === BUSINESS_CHOICE ? "" : reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={!isEditing || selection === BUSINESS_CHOICE}
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              In effect now: <span className="font-medium">{CHECKOUT_FEE_MODE_LABELS[state.feeMode]}</span>
              {state.overrideFeeMode ? " (set by Easner)" : " (business choice)"}
            </p>

            {error ? (
              <p className="rounded-xl border border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.08)] px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {isEditing ? (
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 bg-transparent"
                  disabled={saving}
                  onClick={cancel}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-primary hover:bg-primary/90"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save fee policy
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
