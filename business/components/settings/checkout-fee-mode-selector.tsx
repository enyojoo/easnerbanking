"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  BUSINESS_SELECTABLE_FEE_MODES,
  checkoutFeeModeDescription,
  checkoutFeeModeLabel,
  type CheckoutFeeMode,
} from "@/lib/stripe/checkout-fee-mode"
import { cn } from "@/lib/utils"

type CheckoutFeeModeSelectorProps = {
  feeMode: CheckoutFeeMode
  managedByEasner: boolean
  saving?: boolean
  onSelect: (mode: CheckoutFeeMode) => Promise<void>
}

export function CheckoutFeeModeSelector({
  feeMode,
  managedByEasner,
  saving = false,
  onSelect,
}: CheckoutFeeModeSelectorProps) {
  const [localSaving, setLocalSaving] = useState(false)
  const busy = saving || localSaving

  const choose = async (mode: CheckoutFeeMode) => {
    setLocalSaving(true)
    try {
      await onSelect(mode)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save")
    } finally {
      setLocalSaving(false)
    }
  }

  if (managedByEasner) {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="font-medium text-foreground">
          Managed by Easner — {checkoutFeeModeLabel(feeMode)}
        </p>
        <p className="mt-1 text-muted-foreground">{checkoutFeeModeDescription(feeMode)}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {BUSINESS_SELECTABLE_FEE_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          disabled={busy}
          onClick={() => void choose(mode)}
          className={cn(
            "rounded-lg border p-3 text-left transition-colors",
            feeMode === mode ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
            busy && "opacity-60",
          )}
          aria-pressed={feeMode === mode}
        >
          <span className="block text-sm font-medium text-foreground">
            {checkoutFeeModeLabel(mode)}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {checkoutFeeModeDescription(mode)}
          </span>
        </button>
      ))}
    </div>
  )
}
